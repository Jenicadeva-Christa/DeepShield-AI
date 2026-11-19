/**
 * DeepShield AI - K-Means & K-Medoids Behavioral Clustering Engine
 * 
 * Standalone Machine Learning Module:
 * - Unsupervised behavioral transaction profiling & clustering.
 * - K-Means++ intelligent centroid initialization for rapid convergence.
 * - Lloyd's Expectation-Maximization algorithm for standard clustering.
 * - K-Medoids (PAM - Partitioning Around Medoids) for outlier-resilient baseline profiling.
 * - Dynamic cluster variance & radius estimation for adaptive anomaly scoring.
 * 
 * 100% Plain JavaScript — Zero external Python or native C++ dependencies.
 */

class KMeansAnomalyDetector {
  /**
   * @param {Object} options
   * @param {number} [options.k=3] - Number of behavioral clusters
   * @param {number} [options.maxIterations=100] - Maximum EM iterations
   * @param {number} [options.tolerance=1e-4] - Centroid convergence tolerance
   * @param {'euclidean'|'manhattan'} [options.distanceMetric='euclidean'] - Distance metric
   * @param {'kmeans'|'kmedoids'} [options.algorithm='kmeans'] - Clustering variant
   * @param {number} [options.anomalyThreshold=65] - Outlier threshold (0-100)
   */
  constructor(options = {}) {
    this.k = options.k || 3;
    this.maxIterations = options.maxIterations || 100;
    this.tolerance = options.tolerance || 1e-4;
    this.distanceMetric = options.distanceMetric || 'euclidean';
    this.algorithm = options.algorithm || 'kmeans';
    this.anomalyThreshold = options.anomalyThreshold || 65;

    this.centroids = [];
    this.clusterStats = [];
    this.isFitted = false;
  }

  /**
   * Calculate distance between two multidimensional points
   * @param {number[]} a 
   * @param {number[]} b 
   * @returns {number}
   */
  distance(a, b) {
    if (this.distanceMetric === 'manhattan') {
      let sum = 0;
      for (let i = 0; i < a.length; i++) {
        sum += Math.abs(a[i] - b[i]);
      }
      return sum;
    }

    // Default: Euclidean distance
    let sumSq = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sumSq += diff * diff;
    }
    return Math.sqrt(sumSq);
  }

  /**
   * K-Means++ Centroid Initialization
   * Ensures well-spread initial centroids to avoid poor local minima.
   * @param {number[][]} data 
   * @param {number} k 
   * @returns {number[][]}
   */
  initializeKMeansPlusPlus(data, k) {
    const centroids = [];
    const n = data.length;

    // Pick first centroid uniformly at random
    const firstIdx = Math.floor(Math.random() * n);
    centroids.push([...data[firstIdx]]);

    // Select remaining k - 1 centroids
    for (let c = 1; c < k; c++) {
      const distances = new Array(n);
      let totalDistSq = 0;

      for (let i = 0; i < n; i++) {
        let minDist = Infinity;
        for (const centroid of centroids) {
          const d = this.distance(data[i], centroid);
          if (d < minDist) minDist = d;
        }
        const dSq = minDist * minDist;
        distances[i] = dSq;
        totalDistSq += dSq;
      }

      // Pick next centroid with probability proportional to D(x)^2
      const target = Math.random() * totalDistSq;
      let cumulative = 0;
      let chosenIdx = 0;

      for (let i = 0; i < n; i++) {
        cumulative += distances[i];
        if (cumulative >= target) {
          chosenIdx = i;
          break;
        }
      }

      centroids.push([...data[chosenIdx]]);
    }

    return centroids;
  }

  /**
   * Train clustering model on normal behavioral transaction baseline
   * @param {number[][]} data - Matrix of feature vectors [samples x features]
   */
  fit(data) {
    if (!data || data.length === 0) {
      throw new Error('KMeansAnomalyDetector: Training data cannot be empty.');
    }

    const n = data.length;
    const numFeatures = data[0].length;
    const effectiveK = Math.min(this.k, n);

    if (this.algorithm === 'kmedoids') {
      this._fitKMedoids(data, effectiveK, numFeatures);
    } else {
      this._fitKMeans(data, effectiveK, numFeatures);
    }

    // Calculate cluster statistics: radii, variances, sizes
    this._computeClusterStats(data);
    this.isFitted = true;
    return this;
  }

  /**
   * Standard Lloyd's K-Means clustering algorithm
   * @private
   */
  _fitKMeans(data, k, numFeatures) {
    let centroids = this.initializeKMeansPlusPlus(data, k);
    let iterations = 0;
    let converged = false;

    while (iterations < this.maxIterations && !converged) {
      // 1. Assignment step
      const clusters = Array.from({ length: k }, () => []);
      for (let i = 0; i < data.length; i++) {
        const point = data[i];
        let closestIdx = 0;
        let minDist = Infinity;

        for (let j = 0; j < k; j++) {
          const d = this.distance(point, centroids[j]);
          if (d < minDist) {
            minDist = d;
            closestIdx = j;
          }
        }
        clusters[closestIdx].push(point);
      }

      // 2. Update step
      const newCentroids = [];
      let totalShift = 0;

      for (let j = 0; j < k; j++) {
        if (clusters[j].length === 0) {
          // Empty cluster fallback: keep previous centroid or re-seed
          newCentroids.push([...centroids[j]]);
          continue;
        }

        const clusterPoints = clusters[j];
        const mean = new Array(numFeatures).fill(0);

        for (const pt of clusterPoints) {
          for (let f = 0; f < numFeatures; f++) {
            mean[f] += pt[f];
          }
        }

        for (let f = 0; f < numFeatures; f++) {
          mean[f] /= clusterPoints.length;
        }

        totalShift += this.distance(centroids[j], mean);
        newCentroids.push(mean);
      }

      if (totalShift < this.tolerance) {
        converged = true;
      }

      centroids = newCentroids;
      iterations++;
    }

    this.centroids = centroids;
  }

  /**
   * K-Medoids (PAM - Partitioning Around Medoids)
   * Centroids are restricted to actual observed transactions, making it highly robust
   * to extreme outliers and contaminated audit logs.
   * @private
   */
  _fitKMedoids(data, k, numFeatures) {
    // Initialize medoid indices using K-Means++ seeding
    const initialMedoids = this.initializeKMeansPlusPlus(data, k);
    let medoidIndices = initialMedoids.map(initPoint => {
      // Find closest existing data point index
      let bestIdx = 0;
      let minD = Infinity;
      for (let i = 0; i < data.length; i++) {
        const d = this.distance(data[i], initPoint);
        if (d < minD) {
          minD = d;
          bestIdx = i;
        }
      }
      return bestIdx;
    });

    let iterations = 0;
    let changed = true;

    while (iterations < this.maxIterations && changed) {
      changed = false;
      const clusters = Array.from({ length: k }, () => []);

      // 1. Assign each point to closest medoid
      for (let i = 0; i < data.length; i++) {
        let bestMedoid = 0;
        let minDist = Infinity;
        for (let m = 0; m < k; m++) {
          const d = this.distance(data[i], data[medoidIndices[m]]);
          if (d < minDist) {
            minDist = d;
            bestMedoid = m;
          }
        }
        clusters[bestMedoid].push(i);
      }

      // 2. Find point within each cluster that minimizes sum of distances to other cluster members
      for (let m = 0; m < k; m++) {
        const members = clusters[m];
        if (members.length === 0) continue;

        let bestCandidate = medoidIndices[m];
        let minCost = Infinity;

        for (const candidateIdx of members) {
          let cost = 0;
          for (const otherIdx of members) {
            cost += this.distance(data[candidateIdx], data[otherIdx]);
          }
          if (cost < minCost) {
            minCost = cost;
            bestCandidate = candidateIdx;
          }
        }

        if (bestCandidate !== medoidIndices[m]) {
          medoidIndices[m] = bestCandidate;
          changed = true;
        }
      }

      iterations++;
    }

    this.centroids = medoidIndices.map(idx => [...data[idx]]);
  }

  /**
   * Compute cluster radii, standard deviations, and member counts
   * @private
   */
  _computeClusterStats(data) {
    const k = this.centroids.length;
    const assignments = Array.from({ length: k }, () => []);

    for (const point of data) {
      let closestIdx = 0;
      let minDist = Infinity;
      for (let j = 0; j < k; j++) {
        const d = this.distance(point, this.centroids[j]);
        if (d < minDist) {
          minDist = d;
          closestIdx = j;
        }
      }
      assignments[closestIdx].push(minDist);
    }

    this.clusterStats = assignments.map((distances, idx) => {
      const count = distances.length;
      if (count === 0) {
        return { count: 0, meanDist: 0.1, stdDev: 0.1, radius: 0.2 };
      }

      const meanDist = distances.reduce((a, b) => a + b, 0) / count;
      const variance = distances.reduce((sum, d) => sum + Math.pow(d - meanDist, 2), 0) / count;
      const stdDev = Math.sqrt(variance) || 0.05;

      // Sort distances to compute 95th percentile radius
      distances.sort((a, b) => a - b);
      const p95Idx = Math.min(count - 1, Math.floor(count * 0.95));
      const radius = Math.max(distances[p95Idx], stdDev * 2, 0.05);

      return {
        count,
        meanDist: Number(meanDist.toFixed(4)),
        stdDev: Number(stdDev.toFixed(4)),
        radius: Number(radius.toFixed(4))
      };
    });
  }

  /**
   * Find nearest cluster for a sample point
   * @param {number[]} sample 
   * @returns {{ clusterIndex: number, distance: number, centroid: number[] }}
   */
  predictCluster(sample) {
    if (!this.isFitted || this.centroids.length === 0) {
      throw new Error('Model must be fitted before making predictions.');
    }

    let closestIdx = 0;
    let minDistance = Infinity;

    for (let j = 0; j < this.centroids.length; j++) {
      const d = this.distance(sample, this.centroids[j]);
      if (d < minDistance) {
        minDistance = d;
        closestIdx = j;
      }
    }

    return {
      clusterIndex: closestIdx,
      distance: minDistance,
      centroid: this.centroids[closestIdx]
    };
  }

  /**
   * Compute normalized fraud outlier score (0 - 100)
   * Evaluates how far the sample deviates from the nearest cluster boundary.
   * @param {number[]} sample 
   * @returns {{ score: number, clusterIndex: number, distance: number, isAnomaly: boolean, zScore: number }}
   */
  predictAnomalyScore(sample) {
    const { clusterIndex, distance } = this.predictCluster(sample);
    const stats = this.clusterStats[clusterIndex] || { meanDist: 0.1, stdDev: 0.1, radius: 0.2 };

    // Standardized Z-Score distance relative to cluster dispersion
    const zScore = Math.max(0, (distance - stats.meanDist) / (stats.stdDev || 0.05));

    // Non-linear sigmoid-like scaling to produce intuitive 0-100 risk score
    // When distance == radius, score ~ 65 (threshold)
    const normalizedRatio = distance / (stats.radius || 0.2);
    let score = Math.round((1 - Math.exp(-1.1 * normalizedRatio)) * 100);
    score = Math.min(100, Math.max(0, score));

    return {
      score,
      clusterIndex,
      distance: Number(distance.toFixed(4)),
      zScore: Number(zScore.toFixed(2)),
      isAnomaly: score >= this.anomalyThreshold
    };
  }

  /**
   * Helper to transform a banking transaction object into a normalized feature vector
   * matching DeepShield AI's standard transaction parameters.
   * @param {Object} tx 
   * @param {Object} [baseline={}]
   * @returns {number[]}
   */
  static extractTransactionFeatures(tx, baseline = {}) {
    const amountMax = 500000;
    const amount = Math.min(tx.amount || 0, amountMax) / amountMax;

    const balance = baseline.balance || 100000;
    const amountVsBalance = Math.min((tx.amount || 0) / balance, 2.0) / 2.0;

    const velocity10m = Math.min(tx.velocity10m || 0, 10) / 10;
    const velocity1h = Math.min(tx.velocity1h || 0, 20) / 20;
    const velocity24h = Math.min(tx.velocity24h || 0, 50) / 50;

    const isNewPayee = tx.payee?.isNew ? 1.0 : 0.0;
    const isNewDevice = tx.device?.isKnown === false ? 1.0 : 0.0;
    const isNewCity = (baseline.usualCities && !baseline.usualCities.includes(tx.location?.city)) ? 1.0 : 0.0;

    const hour = (new Date(tx.timestamp || Date.now()).getHours()) / 24.0;

    return [amount, amountVsBalance, velocity10m, velocity1h, velocity24h, isNewPayee, isNewDevice, isNewCity, hour];
  }
}

module.exports = KMeansAnomalyDetector;
