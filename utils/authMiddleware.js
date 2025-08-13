/**
 * Auth Middleware
 * Verifies JWT token and attaches user info to request.
 */
const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Attach userId from token to request
    req.user = { userId: decoded.userId };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token is not valid' });
  }
}

module.exports = authMiddleware;