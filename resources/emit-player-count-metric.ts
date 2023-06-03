import { ECS } from '@aws-sdk/client-ecs';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch'
import { queryGameServerInfo } from 'steam-server-query';

// a lambda function that checks the number of running task
// of a ECS fargate service

export const handler = async (event: any): Promise<void> => {
  const SERVICE_ARN = process.env.SERVICE_ARN;
  const CLUSTER_ARN = process.env.CLUSTER_ARN;
  const METRIC_NAMESPACE = process.env.METRIC_NAMESPACE;
  const METRIC_NAME = process.env.METRIC_NAME;
  const SERVER_DNS_NAME = process.env.SERVER_DNS_NAME;
  const SERVER_QUERY_PORT = process.env.SERVER_QUERY_PORT || '2457';

  if (!SERVER_DNS_NAME || !SERVICE_ARN || !CLUSTER_ARN || !METRIC_NAMESPACE || !METRIC_NAME) {
    throw new Error('SERVER_DNS_NAME, SERVICE_ARN, CLUSTER_ARN, METRIC_NAMESPACE and METRIC_NAME are not defined')
  }

  const ecs: ECS = new ECS({});

  // get reference of a ecs service using the SERVICE_NAME and clusterName
  try {
    const output = await ecs.describeServices({cluster: CLUSTER_ARN, services: [SERVICE_ARN]})
    if (output.services?.length === 0) {
      console.log('No service found');
      return;
    }

    if (output.services![0].runningCount === 0) {
      console.log('No running task');
      return;
    }

    const steamServerInfo = await queryGameServerInfo(`${SERVER_DNS_NAME}:${SERVER_QUERY_PORT}`)
    console.log(`player count on ${SERVER_DNS_NAME}:${SERVER_QUERY_PORT} is ${steamServerInfo.players}`)
    const cwClient = new CloudWatchClient({})
    const putMetricDataCommand = new PutMetricDataCommand({
      MetricData: [
        {
          MetricName: METRIC_NAME,
          Unit: "Count",
          Value: steamServerInfo.players,
        },
      ],
      Namespace: METRIC_NAMESPACE
    })
    await cwClient.send(putMetricDataCommand);
  }
   catch (e) {
    console.log(e);
    throw e
  }
}