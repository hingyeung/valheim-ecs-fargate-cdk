import * as cdk from "@aws-cdk/core";
import { Arn, StackProps } from "@aws-cdk/core";
import { Metric } from "@aws-cdk/aws-cloudwatch"
import { DnsNameUpdaterService } from '../lib/dns-name-updater-service';
import { NoPlayersMonitoringService } from '../lib/no-players-monitoring-service';

interface ValheimServerMonitoringProps extends StackProps {
  clusterArn: Arn;
  serviceArn: Arn;
  noPlayersMetric: Metric;
}

export class ValheimServerMonitoringStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: ValheimServerMonitoringProps) {
    super(scope, id, props);
    new NoPlayersMonitoringService(this, "NoPlayersMonitoringService", {
      noPlayerMetric: props.noPlayersMetric,
      clusterArn: props.clusterArn,
      serviceArn: props.serviceArn,
      region: cdk.Stack.of(this).region
    })
  }
}