/**
 * Plain JavaScript Isolation Forest Anomaly Detection Algorithm
 * Builds an ensemble of Isolation Trees to isolate anomalies.
 * Anomalies have shorter path lengths in the trees.
 */

class IsolationTreeNode {
  constructor(size) {
    aria: this.size = size;
    this.left = null;
    this.right = null;
    this.splitFeature = null;
    this.splitValue = null;
  }
}

class IsolationTree {
  constructor(maxHeight) {
    this.maxHeight = maxHeight;
    this.root = null;
  }

  fit(data, currentHeight = 0) {
    const numSamples = data.length;
    if (currentHeight >= this.maxHeight || numSamples <= 1) {
      const node = new IsolationTreeNode(numSamples);
      return node;
    }

    const numFeatures = data[0].length;
    const splitFeature = Math.floor(Math.random() * numFeatures);
    
    let minVal = data[0][splitFeature];
    let maxVal = data[0][splitFeature];
    for (let i = 1; i < numSamples; i++) {
      const val = data[i][splitFeature];
      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;
    }

    if (minVal === maxVal) {
      const node = new IsolationTreeNode(numSamples);
      return node;
    }

    const splitValue = minVal + Math.random() * (maxVal - minVal);
    const leftData = [];
    const rightData = [];

    for (let i = 0; i < numSamples; i++) {
      if (data[i][splitFeature] < splitValue) {
        leftData.push(data[i]);
      } else {
        rightData.push(data[i]);
      }
    }

    const node = new IsolationTreeNode(numSamples);
    node.splitFeature = splitFeature;
    node.splitValue = splitValue;
    node.left = this.fit(leftData, currentHeight + 1);
    node.right = this.fit(rightData, currentHeight + 1);
    return node;
  }

  pathLength(sample, node, currentHeight = 0) {
    if (!node.left || !node.right) {
      return currentHeight + this.averagePathLengthOfUnbuiltTree(node.size);
    }
    if (sample[node.splitFeature] < node.splitValue) {
      return this.pathLength(sample, node.left, currentHeight + 1);
    } else {
      return this.pathLength(sample, node.right, currentHeight + 1);
    }
  }

  averagePathLengthOfUnbuiltTree(n) {
    if (n <= 1) return 0;
    if (n === 2) return 1;
    // Euler-Mascheroni constant approx 0.5772156649
    return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1) / n);
  }
}

class IsolationForest {
  constructor(numTrees = 50, subSampleSize = 256) {
    this.numTrees = numTrees;
    this.subSampleSize = subSampleSize;
    this.trees = [];
    this.cFactor = this.averagePathLengthOfUnbuiltTree(subSampleSize);
  }

  averagePathLengthOfUnbuiltTree(n) {
    if (n <= 1) return 0;
    if (n === 2) return 1;
    return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1) / n);
  }

  fit(data) {
    if (!data || data.length === 0) return;
    const numSamples = data.length;
    const sampleSize = Math.min(this.subSampleSize, numSamples);
    const maxHeight = Math.ceil(Math.log2(sampleSize));

    this.trees = [];
    for (let i = 0; i < this.numTrees; i++) {
      // Subsample data
      const subSample = [];
      for (let s = 0; s < sampleSize; s++) {
        const randIdx = Math.floor(Math.random() * numSamples);
        subSample.push(data[randIdx]);
      }

      const tree = new IsolationTree(maxHeight);
      tree.root = tree.fit(subSample);
      this.trees.push(tree);
    }
  }

  predictScore(sample) {
    if (this.trees.length === 0) return 0;
    let totalPathLength = 0;
    for (const tree of this.trees) {
      totalPathLength += tree.pathLength(sample, tree.root);
    }
    const avgPathLength = totalPathLength / this.trees.length;
    // Anomaly score formula: 2 ^ (- avgPathLength / c)
    const score = Math.pow(2, - (avgPathLength / this.cFactor));
    // Scale to 0-100 score
    return Math.min(100, Math.max(0, Math.round(score * 100)));
  }
}

module.exports = IsolationForest;
