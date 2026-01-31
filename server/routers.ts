import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { trucksRouter } from "./routers/trucks";
import { skusRouter } from "./routers/skus";
import { ordersRouter } from "./routers/orders";
import { personnelRouter } from "./routers/personnel";
import { deliveryRunsRouter } from "./routers/deliveryRuns";
import { dashboardRouter } from "./routers/dashboard";
import { optimizeRouter } from "./routers/optimize";
import { globalOptimizeRouter } from "./routers/globalOptimize";
import { liveTrackingRouter } from "./routers/liveTracking";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Feature routers
  trucks: trucksRouter,
  skus: skusRouter,
  orders: ordersRouter,
  personnel: personnelRouter,
  deliveryRuns: deliveryRunsRouter,
  dashboard: dashboardRouter,
  optimize: optimizeRouter,
  globalOptimize: globalOptimizeRouter,
  liveTracking: liveTrackingRouter,
});

export type AppRouter = typeof appRouter;
