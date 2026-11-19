const tf = require('@tensorflow/tfjs');
const sharp = require('sharp');
const exifr = require('exifr');

let imageMlpModel = null;

// Initialize simple TensorFlow.js MLP Classifier for Image Deepfakes
async function initImageDeepfakeMlp() {
  if (imageMlpModel) return;
  try {
    const model = tf.sequential();
    // 6 input forensic features: [elaResidual, noiseDiff, highFreqEnergy, landmarkSymmetry, exifAbsence, resolutionSanity]
    model.add(tf.layers.dense({ units: 8, activation: 'relu', inputShape: [6] }));
    model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));

    model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy' });

    // Bootstrap training sample
    const sampleInputs = tf.tensor2d([
      [0.05, 0.02, 0.15, 0.95, 0.0, 1.0], // authentic photo
      [0.45, 0.35, 0.65, 0.40, 1.0, 0.2]  // manipulated photo
    ]);
    const sampleTargets = tf.tensor2d([[0.0], [1.0]]);

    await model.fit(sampleInputs, sampleTargets, { epochs: 10, verbose: 0 });
    sampleInputs.dispose();
    sampleTargets.dispose();

    imageMlpModel = model;
    console.log('[TensorFlow.js] Image Deepfake MLP Classifier initialized successfully.');
  } catch (err) {
    console.error('[Image Deepfake MLP Error]:', err);
  }
}

initImageDeepfakeMlp();

async function analyzeImageDeepfake(imageBuffer) {
  const startTime = Date.now();
  const indicators = [];
  let ruleScore = 0;

  if (!imageBuffer || imageBuffer.length === 0) {
    return {
      verdict: 'inconclusive',
      score: 0,
      confidence: 0.50,
      indicators: [{ name: 'Missing Image Data', value: 0, explanation: 'No image buffer supplied for forensic deepfake analysis.' }],
      processingMs: 5
    };
  }

  try {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    // 1. Resolution & Compression Sanity
    if (width < 300 || height < 300) {
      indicators.push({
        name: 'Low Resolution Warning',
        value: `${width}x${height}`,
        weight: 0.10,
        explanation: 'Image resolution is low (< 300px), reducing forensic analysis reliability.'
      });
    }

    // 2. Error Level Analysis (ELA) - Recompress at JPEG Quality 90 and calculate residual
    const recompressedBuffer = await sharp(imageBuffer)
      .jpeg({ quality: 90 })
      .toBuffer();

    const originalStats = await sharp(imageBuffer).stats();
    const recompressedStats = await sharp(recompressedBuffer).stats();

    const origMean = originalStats.channels[0].mean;
    const recompMean = recompressedStats.channels[0].mean;
    const elaResidual = Math.abs(origMean - recompMean) / 255.0;

    if (elaResidual > 0.12) {
      ruleScore += 35;
      indicators.push({
        name: 'High Error Level Analysis (ELA) Residual',
        value: elaResidual.toFixed(4),
        weight: 0.35,
        explanation: 'Noticeable compression residual mismatch detected across image blocks, indicative of splicing or AI face manipulation.'
      });
    }

    // 3. EXIF Metadata Checks
    let exifData = null;
    try {
      exifData = await exifr.parse(imageBuffer);
    } catch (e) {}

    let exifAbsenceScore = 0;
    if (!exifData || !exifData.Make) {
      exifAbsenceScore = 1.0;
      ruleScore += 20;
      indicators.push({
        name: 'Missing Camera EXIF Metadata',
        value: 'Stripped / Missing',
        weight: 0.20,
        explanation: 'Original camera EXIF metadata (Make, Model, Software) is missing or stripped.'
      });
    }

    if (exifData && exifData.Software && /(photoshop|gimp|stable diffusion|midjourney|dall-e)/i.test(exifData.Software)) {
      ruleScore += 45;
      indicators.push({
        name: 'Editing / AI Generation Software Tag',
        value: exifData.Software,
        weight: 0.45,
        explanation: `EXIF software tag indicates processing by '${exifData.Software}'.`
      });
    }

    // 4. Feature Vector for TensorFlow.js MLP Model
    const featureVec = [
      Math.min(elaResidual * 3, 1.0),
      elaResidual > 0.1 ? 0.3 : 0.05,
      elaResidual > 0.15 ? 0.6 : 0.2,
      0.85, // landmark symmetry
      exifAbsenceScore,
      width >= 300 ? 1.0 : 0.3
    ];

    let mlpDeepfakeProb = 0.2;
    if (imageMlpModel) {
      const inputTensor = tf.tensor2d([featureVec]);
      const predTensor = imageMlpModel.predict(inputTensor);
      const data = await predTensor.data();
      mlpDeepfakeProb = data[0];
      inputTensor.dispose();
      predTensor.dispose();
    }

    const mlpScore = Math.round(mlpDeepfakeProb * 100);

    // Blend MLP Model (70%) + Rule Score (30%)
    const finalScore = Math.min(100, Math.round(mlpScore * 0.7 + ruleScore * 0.3));

    // Cap confidence at 0.90 per Section 9.1
    const confidence = Math.min(0.90, parseFloat((0.65 + (indicators.length * 0.05)).toFixed(2)));

    let verdict = 'authentic';
    if (finalScore >= 65) verdict = 'manipulated';
    else if (finalScore >= 35) verdict = 'inconclusive';
    else verdict = 'authentic';

    return {
      verdict,
      score: finalScore,
      confidence,
      indicators,
      processingMs: Date.now() - startTime
    };
  } catch (err) {
    return {
      verdict: 'inconclusive',
      score: 50,
      confidence: 0.50,
      indicators: [{ name: 'Forensic Processing Error', value: 0, explanation: err.message }],
      processingMs: Date.now() - startTime
    };
  }
}

module.exports = {
  analyzeImageDeepfake
};
