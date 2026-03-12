const {
  getUsageAggregation,
  resetUsageData,
} = require('../services/usageAggregationService');

function registerOpenClawUsageRoutes({ router, requireAuth, requireAdmin, pool, logger }) {
  router.get('/usage', requireAuth, async (req, res, next) => {
    try {
      const data = await getUsageAggregation({
        pool,
        logger,
        userId: req.user.id,
        query: req.query,
      });
      res.json({ data });
    } catch (error) {
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
      next(error);
    }
  });

  router.post('/usage/reset', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const data = await resetUsageData({
        pool,
        userId: req.user.id,
        password: req.body.password,
      });
      res.json({ data });
    } catch (error) {
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
}

module.exports = {
  registerOpenClawUsageRoutes,
};
