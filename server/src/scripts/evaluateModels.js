require('dotenv').config({ path: __dirname + '/../../.env' });
const { connectDB } = require('../config/db');
const AIModel = require('../models/aimodels.model');
const { analyzeTextPhishing } = require('../engine/textPhishing.engine');

async function runEvaluationPipeline() {
  console.log('\n======================================================');
  console.log(' Starting DeepShield AI Model Evaluation (npm run evaluate)');
  console.log('======================================================\n');

  await connectDB();

  // Test set for text phishing
  const testSet = [
    { text: "Your SBI account is blocked. Update KYC at http://verify-sbi-bank-login.com", expected: "phishing" },
    { text: "URGENT: Submit OTP and PIN immediately or account will be suspended.", expected: "phishing" },
    { text: "Your SBI account 3009XXXX1234 has been credited with INR 5,000 on 18-Sep-2026.", expected: "legitimate" },
    { text: "OTP for transaction at Amazon India is 482910.", expected: "legitimate" }
  ];

  let correct = 0;
  for (const item of testSet) {
    const res = await analyzeTextPhishing(item.text);
    const predicted = res.verdict === 'malicious' || res.verdict === 'suspicious' ? 'phishing' : 'legitimate';
    if (predicted === item.expected) correct++;
  }

  const measuredAccuracy = parseFloat((correct / testSet.length).toFixed(2));
  console.log(`[Evaluation Metric] Text Phishing Model Accuracy on Test Split: ${(measuredAccuracy * 100).toFixed(0)}%`);

  await AIModel.findOneAndUpdate(
    { modelType: 'phishing' },
    { accuracy: measuredAccuracy, evaluationNotes: `Measured accuracy: ${(measuredAccuracy * 100).toFixed(0)}% on ${testSet.length} test samples.` }
  );

  console.log('\n======================================================');
  console.log(' Evaluation Completed & Saved to aimodels Collection!');
  console.log('======================================================\n');
  process.exit(0);
}

runEvaluationPipeline().catch(err => {
  console.error('[Evaluation Error]:', err);
  process.exit(1);
});
