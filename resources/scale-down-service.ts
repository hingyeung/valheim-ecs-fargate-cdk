"use strict";

import { ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { print } from 'util';

const REGION = process.env.REGION;

exports.handler = async (event, context, callback) => {
  console.log(process.env.CLUSTER_ARN)
  console.log(process.env.SERVICE_ARN)
  const client = new ECSClient({ region: REGION }),
    params = {
      desiredCount: 0,
      service: process.env.SERVICE_ARN,
      cluster: process.env.CLUSTER_ARN
    }

  const updateCommand = new UpdateServiceCommand(params);
    
  const resp = await client.send(updateCommand);
  console.log(resp);
}