const logger = require('../utils/logger');
const {
  getSessionsStatusData,
  listSessionsData,
  deleteSessionByKey,
} = require('../services/sessionListService');
const { getSessionMessagesData } = require('../services/sessionMessageService');

function isServiceUnavailableError(error) {
  return error.code === 'SERVICE_NOT_CONFIGURED' || error.code === 'SERVICE_UNAVAILABLE';
}

function registerOpenClawSessionRoutes({ router, requireAuth, requireAdmin }) {
  router.get('/sessions/status', requireAuth, async (req, res, next) => {
    try {
      const data = await getSessionsStatusData();
      return res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/sessions', requireAuth, async (req, res, next) => {
    try {
      const result = await listSessionsData({ userId: req.user.id });
      res.json({
        data: result.sessions,
        dailyCost: result.dailyCost || 0,
      });
    } catch (error) {
      if (isServiceUnavailableError(error)) {
        logger.warn('OpenClaw Gateway not available for sessions, returning empty array', {
          userId: req.user.id,
        });
        return res.json({ data: [] });
      }
      next(error);
    }
  });

  router.delete('/sessions', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      await deleteSessionByKey({
        userId: req.user.id,
        sessionKey: req.query.key,
      });
      return res.status(204).send();
    } catch (error) {
      if (isServiceUnavailableError(error)) {
        return res.status(503).json({
          error: {
            message: 'OpenClaw Gateway is not available',
            status: 503,
          },
        });
      }
      if (error.status) {
        return res.status(error.status).json({
          error: {
            message: error.message,
            status: error.status,
            ...(error.code ? { code: error.code } : {}),
          },
        });
      }
      next(error);
    }
  });

  router.get('/sessions/:sessionId/messages', requireAuth, async (req, res, next) => {
    try {
      const data = await getSessionMessagesData({
        userId: req.user.id,
        sessionId: req.params.sessionId,
        sessionKey: req.query.key,
        limit: req.query.limit || 50,
        includeTools: req.query.includeTools || false,
      });

      res.json({ data });
    } catch (error) {
      if (isServiceUnavailableError(error)) {
        logger.warn('OpenClaw Gateway not available for session messages, returning empty', {
          userId: req.user.id,
          sessionId: req.params.sessionId,
        });
        return res.json({
          data: {
            messages: [],
            session: {
              id: req.params.sessionId,
              key: req.query.key || null,
              label: req.params.sessionId,
              agent: 'unknown',
              status: 'unknown',
            },
          },
        });
      }
      if (error.status === 400 || error.code === 'AGENT_TO_AGENT_DISABLED') {
        return res.status(error.status || 400).json({
          error:
            error.code === 'AGENT_TO_AGENT_DISABLED'
              ? {
                  message: error.message,
                  code: error.code,
                  hint: error.hint,
                  details: error.details,
                }
              : error.message,
        });
      }
      next(error);
    }
  });
}

module.exports = {
  registerOpenClawSessionRoutes,
};
