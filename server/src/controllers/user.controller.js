const User = require('../models/users.model');
const Customer = require('../models/customers.model');
const StaffProfile = require('../models/staffprofiles.model');
const { hashPassword } = require('../utils/crypto.utils');
const { createAuditEntry } = require('../middleware/audit.middleware');

exports.getUsers = async (req, res, next) => {
  try {
    const { role, status, search, page = 1, limit = 20 } = req.query;
    const query = {};

    if (role) query.role = role;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    next(err);
  }
};

exports.createUser = async (req, res, next) => {
  try {
    const { fullName, email, phone, password, role, department, designation } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email address already exists.' });
    }

    const passwordHash = await hashPassword(password || 'Password@123');
    const user = new User({
      fullName,
      email: email.toLowerCase(),
      phone,
      passwordHash,
      role: role || 'customer',
      status: 'active'
    });
    await user.save();

    if (user.role === 'customer') {
      const accountNumber = '3009' + Math.floor(10000000 + Math.random() * 90000000).toString();
      await Customer.create({
        userId: user._id,
        accountNumber,
        balance: 100000
      });
    } else {
      const employeeId = 'EMP-' + Math.floor(1000 + Math.random() * 9000).toString();
      await StaffProfile.create({
        userId: user._id,
        employeeId,
        department: department || 'Risk & Security',
        designation: designation || role
      });
    }

    await createAuditEntry({
      userId: req.user._id,
      action: 'ADMIN_CREATED_USER',
      entity: 'User',
      entityId: user._id.toString(),
      details: { email: user.email, role: user.role },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    return res.status(201).json({
      success: true,
      message: 'User created successfully.',
      data: user
    });
  } catch (err) {
    next(err);
  }
};

exports.getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    let profile = null;
    if (user.role === 'customer') {
      profile = await Customer.findOne({ userId: user._id });
    } else {
      profile = await StaffProfile.findOne({ userId: user._id });
    }

    return res.status(200).json({
      success: true,
      data: { user, profile }
    });
  } catch (err) {
    next(err);
  }
};

exports.updateUser = async (req, res, next) => {
  try {
    const { fullName, phone, role } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (fullName) user.fullName = fullName;
    if (phone) user.phone = phone;
    if (role && user.role !== role) {
      user.role = role;
    }

    await user.save();

    await createAuditEntry({
      userId: req.user._id,
      action: 'ADMIN_UPDATED_USER',
      entity: 'User',
      entityId: user._id.toString(),
      details: { fullName, phone, role },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    return res.status(200).json({
      success: true,
      message: 'User updated successfully.',
      data: user
    });
  } catch (err) {
    next(err);
  }
};

exports.updateUserStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['active', 'inactive', 'locked', 'suspended'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    user.status = status;
    if (status === 'active') {
      user.failedLoginAttempts = 0;
      user.lockUntil = undefined;
    }
    await user.save();

    await createAuditEntry({
      userId: req.user._id,
      action: 'ADMIN_UPDATED_USER_STATUS',
      entity: 'User',
      entityId: user._id.toString(),
      details: { newStatus: status },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    return res.status(200).json({
      success: true,
      message: `User status updated to ${status}.`,
      data: user
    });
  } catch (err) {
    next(err);
  }
};

exports.unlockUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    user.status = 'active';
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    await createAuditEntry({
      userId: req.user._id,
      action: 'ADMIN_UNLOCKED_USER',
      entity: 'User',
      entityId: user._id.toString(),
      details: { email: user.email },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    return res.status(200).json({
      success: true,
      message: 'User account unlocked successfully.',
      data: user
    });
  } catch (err) {
    next(err);
  }
};
