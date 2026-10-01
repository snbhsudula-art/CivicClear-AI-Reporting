import { Router, type IRouter } from "express";
import healthRouter from "./health";
import civicclearRouter from "./civicclear";

const router: IRouter = Router();

router.use(healthRouter);
router.use(civicclearRouter);

export default router;
