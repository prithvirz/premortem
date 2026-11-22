import type { Finding, NormalizedCompose, RequiredEnvPolicy } from "../types";

export interface RuleContext {
  before: NormalizedCompose;
  after: NormalizedCompose;
  policy?: RequiredEnvPolicy;
}

export type Rule = (ctx: RuleContext) => Finding[];
