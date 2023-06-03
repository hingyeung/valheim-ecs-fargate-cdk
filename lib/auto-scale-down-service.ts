import { Construct, Duration } from "@aws-cdk/core";
import { Alarm, Metric, ComparisonOperator, AlarmActionConfig } from "@aws-cdk/aws-cloudwatch";
import * as ecs from "@aws-cdk/aws-ecs";
import * as lambda from "@aws-cdk/aws-lambda";
import { NodejsFunction } from "@aws-cdk/aws-lambda-nodejs";
import { Policy, PolicyStatement, Effect } from "@aws-cdk/aws-iam"
import * as logs from '@aws-cdk/aws-logs';
import * as actions from "@aws-cdk/aws-cloudwatch-actions";
import * as sns from "@aws-cdk/aws-sns";
import * as subscriptions from "@aws-cdk/aws-sns-subscriptions";

export interface AutoScaleDownServiceProps {
  playerCountMetric: Metric;
  fargateService: ecs.FargateService;
  region: string;
}

export class AutoScaleDownService extends Construct {
  constructor(scope: Construct, id: string, props: AutoScaleDownServiceProps) {
    super(scope, id);

    // create an alarm for player count metric
    // const zeroPlayerAlarm = new Alarm(this, "PlayerCountAlarm", {
    //   metric: props.playerCountMetric,
    //   threshold: 0,
    //   period: Duration.minutes(5),
    //   evaluationPeriods: 6,
    //   statistic: "Maximum",
    //   comparisonOperator: ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
    //   actionsEnabled: true,
    // })

    // create an alarm for player count metric
    const zeroPlayerAlarm = props.playerCountMetric.createAlarm(this, "PlayerCountAlarm", {
      alarmDescription: "Alarm when there are no players",
      comparisonOperator: ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 0,
      evaluationPeriods: 6,
      statistic: "Maximum",
      actionsEnabled: true,
    })

    const topic = new sns.Topic(this, 'NoPlayersAlarmTopic', {
      displayName: "No Players Alarm Topic"
    });
    zeroPlayerAlarm.addAlarmAction(new actions.SnsAction(topic))

    const ecsStartStopPolicy = new Policy(this, "ecsStartStopPolicy", {
      statements: [
        new PolicyStatement({
          resources: [props.fargateService.serviceArn as string],
          effect: Effect.ALLOW,
          actions: [ "ecs:UpdateService" ]
        })
      ]
    });

    const scaleDownFunction = new NodejsFunction(this, "scaleDownFunction", {
      runtime: lambda.Runtime.NODEJS_14_X, // So we can use async 
      entry: 'resources/scale-down-service.ts',
      handler: "handler",
      logRetention: logs.RetentionDays.ONE_WEEK,
      bundling: {
        nodeModules: ['@aws-sdk/client-ecs'],
      },
      environment: {
        SERVICE_ARN: props.fargateService.serviceArn as string,
        CLUSTER_ARN: props.fargateService.cluster.clusterArn as string,
        REGION: props.region
      }
    });
    scaleDownFunction.role?.attachInlinePolicy(ecsStartStopPolicy);

    topic.addSubscription(
      new subscriptions.LambdaSubscription(scaleDownFunction)
    );
  }
}