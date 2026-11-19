const tf = require('@tensorflow/tfjs');

let autoencoderModel = null;
let isTraining = false;

// Feature vector normalization bounds
const STATS = {
  amountMax: 500000,
  velocity10mMax: 10,
  velocity1hMax: 20,
  velocity24hMax: 50
};

function extractFeatureVector(txData, baseline = {}) {
  const isDeposit = txData.type === 'deposit' || txData.direction === 'inbound';
  const refScale = isDeposit ? 2500000 : STATS.amountMax;
  const amount = Math.min(txData.amount || 0, refScale) / refScale;

  const balance = Math.max(10000, baseline.balance || 100000);
  const amountVsBalance = Math.min((txData.amount || 0) / balance, 2.0) / 2.0;
  
  const velocity10m = Math.min(txData.velocity10m || 0, STATS.velocity10mMax) / STATS.velocity10mMax;
  const velocity1h = Math.min(txData.velocity1h || 0, STATS.velocity1hMax) / STATS.velocity1hMax;
  const velocity24h = Math.min(txData.velocity24h || 0, STATS.velocity24hMax) / STATS.velocity24hMax;

  // Counterparty trust check (Payee for outgoing, Sender for incoming)
  let isNewCounterparty = 0.0;
  if (isDeposit) {
    const senderAcc = txData.sender?.accountNumber || txData.payee?.accountNumber;
    const isKnown = (baseline.knownSenders && baseline.knownSenders.includes(senderAcc)) ||
      txData.sender?.isVerified === true ||
      txData.sender?.isKnown === true;
    isNewCounterparty = isKnown ? 0.0 : 1.0;
  } else {
    isNewCounterparty = txData.payee?.isNew ? 1.0 : 0.0;
  }

  const isNewDevice = txData.device?.isKnown ? 0.0 : 1.0;
  const isNewCity = (baseline.usualCities && txData.location?.city && !baseline.usualCities.includes(txData.location.city)) ? 1.0 : 0.0;
  
  const hour = (new Date(txData.timestamp || Date.now()).getHours()) / 24.0;

  return [amount, amountVsBalance, velocity10m, velocity1h, velocity24h, isNewCounterparty, isNewDevice, isNewCity, hour];
}

async function buildAndTrainAutoencoder(normalSamples = []) {
  if (isTraining) return;
  isTraining = true;

  try {
    const inputDim = 9;
    const encodingDim = 4;

    // Build Autoencoder architecture
    const model = tf.sequential();
    // Encoder
    model.add(tf.layers.dense({ units: encodingDim, activation: 'relu', inputShape: [inputDim] }));
    // Decoder
    model.add(tf.layers.dense({ units: inputDim, activation: 'sigmoid' }));

    model.compile({ optimizer: 'adam', loss: 'meanSquaredError' });

    // Prepare training data tensor
    let trainingData = normalSamples;
    if (!trainingData || trainingData.length === 0) {
      // Create synthetic normal baseline dataset
      trainingData = [];
      for (let i = 0; i < 200; i++) {
        trainingData.push([
          Math.random() * 0.1, // normal amount
          Math.random() * 0.1, // low balance ratio
          Math.random() * 0.2, // low velocity 10m
          Math.random() * 0.2, // low velocity 1h
          Math.random() * 0.3, // low velocity 24h
          0.0,                 // known payee
          0.0,                 // known device
          0.0,                 // known city
          0.4 + Math.random() * 0.4 // usual day hours
        ]);
      }
    }

    const xs = tf.tensor2d(trainingData);
    await model.fit(xs, xs, {
      epochs: 30,
      batchSize: 16,
      shuffle: true,
      verbose: 0
    });

    xs.dispose();
    autoencoderModel = model;
    console.log('[TensorFlow.js] Transaction Autoencoder model compiled and trained successfully.');
  } catch (err) {
    console.error('[TensorFlow.js Autoencoder Error]:', err);
  } finally {
    isTraining = false;
  }
}

async function calculateReconstructionError(featureVector) {
  try {
    if (!autoencoderModel) {
      await buildAndTrainAutoencoder();
    }

    if (!autoencoderModel) {
      throw new Error('Autoencoder model could not be initialized');
    }

    const inputTensor = tf.tensor2d([featureVector]);
    const reconstructedTensor = autoencoderModel.predict(inputTensor);

    const mseTensor = tf.losses.meanSquaredError(inputTensor, reconstructedTensor);
    const mseData = await mseTensor.data();
    const mse = mseData[0];

    inputTensor.dispose();
    reconstructedTensor.dispose();
    mseTensor.dispose();

    // Convert MSE reconstruction error to calibrated 0-100 anomaly score
    const score = Math.min(100, Math.max(0, Math.round((mse / 0.15) * 100)));
    return { mse, score, isFallback: false };
  } catch (err) {
    console.warn('[Autoencoder Fallback]: Neural autoencoder model inference fallback applied:', err.message);
    const weights = [0.25, 0.15, 0.15, 0.10, 0.10, 0.15, 0.05, 0.05, 0.0];
    let fallbackScore = 0;
    for (let i = 0; i < featureVector.length && i < weights.length; i++) {
      fallbackScore += (featureVector[i] || 0) * weights[i];
    }
    const score = Math.min(95, Math.max(10, Math.round(fallbackScore * 100)));
    return { mse: 0.04, score, isFallback: true };
  }
}

module.exports = {
  extractFeatureVector,
  buildAndTrainAutoencoder,
  calculateReconstructionError
};
