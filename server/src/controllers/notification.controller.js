const Notification = require('../models/notifications.model');

exports.getMyNotifications = async (req, res, next) => {
  try {
    const { status, limit = 50 } = req.query;
    const query = { userId: req.user._id };
    if (status) query.status = status;

    const notifications = await Notification.find(query)
      .sort({ sentAt: -1, createdAt: -1 })
      .limit(parseInt(limit));

    const unreadCount = await Notification.countDocuments({ userId: req.user._id, status: { $ne: 'read' } });

    return res.status(200).json({
      success: true,
      data: {
        notifications,
        unreadCount
      }
    });
  } catch (err) {
    next(err);
  }
};

exports.markAsRead = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { status: 'read', readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    return res.status(200).json({ success: true, data: notification });
  } catch (err) {
    next(err);
  }
};

exports.markAllAsRead = async (req, res, next) => {
  try {
    await Notification.updateMany(
      { userId: req.user._id, status: { $ne: 'read' } },
      { status: 'read', readAt: new Date() }
    );

    return res.status(200).json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) {
    next(err);
  }
};
