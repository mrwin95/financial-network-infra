#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { VpcStack } from "../lib/vpc-stack";

const app = new cdk.App();

new VpcStack(app, "DevVpcStack", {
  envName: "dev",
  env: { region: "ap-northeast-1" },
});

new VpcStack(app, "QAVpcStack", {
  envName: "qa",
  env: { region: "ap-northeast-1" },
});

new VpcStack(app, "ProdVpcStack", {
  envName: "prod",
  env: { region: "ap-northeast-1" },
});
