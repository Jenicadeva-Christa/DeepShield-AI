const Customer = require('../models/customers.model');

class MockBankCoreService {
  async processDebit(customerId, amount) {
    const customer = await Customer.findById(customerId);
    if (!customer) throw new Error('Customer banking record not found.');
    if (customer.balance < amount) {
      throw new Error(`Insufficient funds. Current balance: ₹${customer.balance.toLocaleString('en-IN')}`);
    }
    customer.balance -= amount;
    await customer.save();
    return { success: true, newBalance: customer.balance };
  }

  async processCredit(customerId, amount) {
    const customer = await Customer.findById(customerId);
    if (!customer) throw new Error('Customer banking record not found.');
    customer.balance += amount;
    await customer.save();
    return { success: true, newBalance: customer.balance };
  }

  async debitAccount(accountOrId, amount) {
    const mongoose = require('mongoose');
    const query = mongoose.Types.ObjectId.isValid(accountOrId)
      ? { $or: [{ _id: accountOrId }, { accountNumber: accountOrId }] }
      : { accountNumber: accountOrId };
    const customer = await Customer.findOne(query);
    if (!customer) return { success: false };
    customer.balance -= amount;
    await customer.save();
    return { success: true, newBalance: customer.balance };
  }

  async creditAccount(accountOrId, amount) {
    const mongoose = require('mongoose');
    const query = mongoose.Types.ObjectId.isValid(accountOrId)
      ? { $or: [{ _id: accountOrId }, { accountNumber: accountOrId }] }
      : { accountNumber: accountOrId };
    const customer = await Customer.findOne(query);
    if (!customer) return { success: false };
    customer.balance += amount;
    await customer.save();
    return { success: true, newBalance: customer.balance };
  }

  async getBalance(customerId) {
    const customer = await Customer.findById(customerId);
    if (!customer) throw new Error('Customer banking record not found.');
    return { balance: customer.balance, currency: customer.currency || 'INR' };
  }
}

module.exports = new MockBankCoreService();
