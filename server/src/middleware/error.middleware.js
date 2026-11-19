function errorHandler(err, req, res, next) {
  console.error(`[Global Error Handler]: ${err.stack || err.message}`);
  
  const statusCode = err.statusCode || res.statusCode !== 200 ? res.statusCode : 500;
  
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    errors: err.errors || null,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
}

function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    message: `Resource not found: ${req.originalUrl}`
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
