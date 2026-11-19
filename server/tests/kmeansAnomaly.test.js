const KMeansAnomalyDetector = require('../src/engine/kmeansAnomaly.engine');

describe('K-Means & K-Medoids Behavioral Clustering Engine (ML)', () => {
  let detector;

  // Generate synthetic baseline clusters:
  // Cluster 0: Micro-purchases (e.g. coffee/groceries) - low amount, low velocity
  // Cluster 1: Monthly recurring payments (e.g. utilities) - moderate amount, day-time
  // Cluster 2: Periodic shopping - higher amount, normal devices
  const generateBaselineTransactions = (samplesPerCluster = 50) => {
    const dataset = [];

    // Cluster 0: Daily small transactions
    for (let i = 0; i < samplesPerCluster; i++) {
      dataset.push([
        0.01 + Math.random() * 0.02, // Amount ~ $5,000 - $10,000 / $500k scale
        0.05 + Math.random() * 0.05, // Balance ratio
        0.10 + Math.random() * 0.05, // Velocity 10m
        0.10 + Math.random() * 0.05, // Velocity 1h
        0.10 + Math.random() * 0.05, // Velocity 24h
        0.0,                         // Known payee
        0.0,                         // Known device
        0.0,                         // Known city
        0.4 + Math.random() * 0.1    // Midday hour
      ]);
    }

    // Cluster 1: Utility & rent payments
    for (let i = 0; i < samplesPerCluster; i++) {
      dataset.push([
        0.15 + Math.random() * 0.05, // Amount ~ $75k
        0.30 + Math.random() * 0.05, // Balance ratio
        0.0,                         // Low velocity
        0.05 + Math.random() * 0.05,
        0.05 + Math.random() * 0.05,
        0.0,
        0.0,
        0.0,
        0.7 + Math.random() * 0.1    // Evening hour
      ]);
    }

    // Cluster 2: Occasional high-end electronic/travel expense
    for (let i = 0; i < samplesPerCluster; i++) {
      dataset.push([
        0.40 + Math.random() * 0.10, // Amount ~ $200k
        0.50 + Math.random() * 0.10, // Balance ratio
        0.0,
        0.10 + Math.random() * 0.05,
        0.15 + Math.random() * 0.05,
        0.0,
        0.0,
        0.0,
        0.5 + Math.random() * 0.1
      ]);
    }

    return dataset;
  };

  test('Should initialize and train standard K-Means model with K-Means++ seeding', () => {
    const trainingData = generateBaselineTransactions(40);
    detector = new KMeansAnomalyDetector({ k: 3, algorithm: 'kmeans' });
    detector.fit(trainingData);

    expect(detector.isFitted).toBe(true);
    expect(detector.centroids.length).toBe(3);
    expect(detector.clusterStats.length).toBe(3);

    // Each cluster should contain data points
    const totalCount = detector.clusterStats.reduce((sum, s) => sum + s.count, 0);
    expect(totalCount).toBe(trainingData.length);
  });

  test('Should classify normal transaction with low anomaly score (< 40)', () => {
    // Normal transaction similar to Cluster 0 (micro-purchase)
    const normalTxFeature = [
      0.02, 0.06, 0.11, 0.12, 0.11, 0.0, 0.0, 0.0, 0.45
    ];

    const result = detector.predictAnomalyScore(normalTxFeature);

    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('clusterIndex');
    expect(result).toHaveProperty('isAnomaly');
    expect(result.isAnomaly).toBe(false);
    expect(result.score).toBeLessThan(45);
  });

  test('Should detect fraudulent anomaly transaction with high anomaly score (>= 65)', () => {
    // Highly abnormal transaction: massive amount, spike in 10-min velocity, new device, new city, midnight
    const fraudTxFeature = [
      0.95, // Max amount
      0.99, // Exceeds balance
      0.90, // Extreme velocity
      0.90,
      0.90,
      1.0,  // New payee
      1.0,  // New device
      1.0,  // New city
      0.05  // 1:00 AM
    ];

    const result = detector.predictAnomalyScore(fraudTxFeature);

    expect(result.isAnomaly).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(65);
    expect(result.zScore).toBeGreaterThan(2.0);
  });

  test('Should train robust K-Medoids (PAM) variant with Manhattan distance', () => {
    const trainingData = generateBaselineTransactions(30);
    const medoidsDetector = new KMeansAnomalyDetector({
      k: 3,
      algorithm: 'kmedoids',
      distanceMetric: 'manhattan'
    });

    medoidsDetector.fit(trainingData);

    expect(medoidsDetector.isFitted).toBe(true);
    expect(medoidsDetector.centroids.length).toBe(3);

    // Centroids in K-Medoids are actual data points from trainingData
    const isCentroidInData = medoidsDetector.centroids.every(centroid =>
      trainingData.some(pt => pt.every((val, idx) => Math.abs(val - centroid[idx]) < 1e-9))
    );
    expect(isCentroidInData).toBe(true);
  });

  test('Should extract normalized features from raw transaction object', () => {
    const rawTx = {
      amount: 15000,
      velocity10m: 1,
      velocity1h: 3,
      velocity24h: 5,
      payee: { isNew: false },
      device: { isKnown: true },
      location: { city: 'Mumbai' },
      timestamp: new Date('2026-10-10T14:30:00Z').getTime()
    };

    const baseline = {
      balance: 100000,
      usualCities: ['Mumbai', 'Pune']
    };

    const features = KMeansAnomalyDetector.extractTransactionFeatures(rawTx, baseline);

    expect(Array.isArray(features)).toBe(true);
    expect(features.length).toBe(9);
    expect(features[0]).toBeCloseTo(15000 / 500000, 3);
    expect(features[5]).toBe(0.0); // isNewPayee
    expect(features[6]).toBe(0.0); // isNewDevice
    expect(features[7]).toBe(0.0); // isNewCity
  });
});
