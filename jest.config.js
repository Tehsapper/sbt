import { createDefaultEsmPreset } from "ts-jest";

const tsJestEsmTransformCfg = createDefaultEsmPreset().transform;

/** @type {import("jest").Config} **/
export default {
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    '(.+)\\.js': '$1',
  },
  transform: {
    ...tsJestEsmTransformCfg,
  },
};