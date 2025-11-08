export const configEnvironments = {
  dev: {
    vpcCidr: "10.10.0.0/16",
    maxAzs: 2,
    natGateways: 1,
  },
  qa: {
    vpcCidr: "10.20.0.0/16",
    maxAzs: 2,
    natGateways: 1,
  },
  prod: {
    vpcCidr: "10.30.0.0/16",
    maxAzs: 2,
    natGateways: 2,
  },
};
