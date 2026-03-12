const logger = require('../utils/logger');
const {
  getConfig,
  applyConfig,
  listBackups,
  readBackup,
} = require('../services/openclawConfigService');

function requireOwnerOrAdmin(req, res, next) {
  if (!req.user || !['admin', 'owner'].includes(req.user.role)) {
    return res.status(403).json({
      error: {
        message: 'Admin or owner access required to manage OpenClaw configuration',
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
      },
    });
  }
  next();
}

function handleKnownConfigError(error, res, next) {
  if (error.status) {
    return res.status(error.status).json({
      error: {
        message: error.message,
        status: error.status,
        ...(error.code ? { code: error.code } : {}),
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
      ...(error.data ? { data: error.data } : {}),
    });
  }

  if (error.code === '42P01') {
    return res.status(503).json({
      error: {
        message: 'Config history table is not available yet. Run DB migrations first.',
        status: 503,
        code: 'HISTORY_TABLE_UNAVAILABLE',
      },
    });
  }

  return next(error);
}

function registerOpenClawConfigRoutes({ router, requireAuth }) {
  router.get('/config', requireAuth, requireOwnerOrAdmin, async (req, res, next) => {
    try {
      logger.info('Fetching OpenClaw config via Gateway RPC', {
        userId: req.user.id,
        userRole: req.user.role,
      });
      const data = await getConfig();
      res.json({ data });
    } catch (error) {
      handleKnownConfigError(error, res, next);
    }
  });

  router.put('/config', requireAuth, requireOwnerOrAdmin, async (req, res, next) => {
    try {
      const data = await applyConfig({
        userId: req.user.id,
        userRole: req.user.role,
        raw: req.body.raw,
        baseHash: req.body.baseHash,
        note: req.body.note,
      });
      res.json({ data });
    } catch (error) {
      handleKnownConfigError(error, res, next);
    }
  });

  router.get('/config/backups', requireAuth, requireOwnerOrAdmin, async (req, res, next) => {
    try {
      logger.info('Listing OpenClaw config backups (DB)', { userId: req.user.id });
      const data = await listBackups();
      res.json({ data });
    } catch (error) {
      if (error.code === '42P01') {
        logger.warn('openclaw_config_history table missing; returning empty backup list');
        return res.json({ data: [] });
      }
      handleKnownConfigError(error, res, next);
    }
  });

  router.get('/config/backups/content', requireAuth, requireOwnerOrAdmin, async (req, res, next) => {
    try {
      logger.info('Reading OpenClaw config backup (DB)', {
        backupPath: req.query.path,
        userId: req.user.id,
      });
      const data = await readBackup(req.query.path);
      res.json({ data });
    } catch (error) {
      handleKnownConfigError(error, res, next);
    }
  });
}

module.exports = {
  registerOpenClawConfigRoutes,
};
