import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as ecs from "@aws-cdk/aws-ecs";
import * as secretsManager from "@aws-cdk/aws-secretsmanager";
import * as efs from "@aws-cdk/aws-efs";
import { Duration, StackProps, validateCfnTag } from "@aws-cdk/core";
import * as logs from '@aws-cdk/aws-logs';
import * as cloudwatch from '@aws-cdk/aws-cloudwatch'
import { DnsNameUpdaterService } from '../lib/dns-name-updater-service';
import { HostedZone } from "@aws-cdk/aws-route53";
import { PlayerCountMetricService } from "./player-count-metric-service";
import { AutoScaleDownService } from "./auto-scale-down-service";

const VALHEIM_SERVER_METRIC_NAMESPACE = "ValheimServer"
const PLAYER_COUNT_METRIC_NAME = "PlayerCount"
const NO_PLAYER_ON_SERVER_METRIC_NAME = "NoPlayersOnServerEventCount"

interface ValheimServerAwsProps extends StackProps {
  serverName: string;
  worldName: string;
  tz: string;
  cpu: string;
  memory: string;
  // valheimServerDnsNameHostedZoneId: string;
  valheimServerDnsNameHostedZoneName: string;
  valheimServerDnsName: string;
};

export class ValheimServerAwsCdkStack extends cdk.Stack {
  private _valheimService: ecs.FargateService;
  private _fargateCluster: ecs.Cluster;
  private _noPlayersMetric: cloudwatch.Metric;
  private _playerCountMetric: cloudwatch.Metric;
  private _serverFileSystem: efs.FileSystem;

  constructor(scope: cdk.Construct, id: string, props: ValheimServerAwsProps) {
    super(scope, id, props);

    // MUST BE DEFINED BEFORE RUNNING CDK DEPLOY! Key Value should be: VALHEIM_SERVER_PASS
    const valheimServerPass = secretsManager.Secret.fromSecretNameV2(
      this,
      "predefinedValheimServerPass",
      "valheimServerPass"
    );

    const vpc = new ec2.Vpc(this, "valheimVpc", {
      cidr: "10.0.0.0/24",
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "valheimPublicSubnet",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
      maxAzs: 1,
    });
    this._fargateCluster = new ecs.Cluster(this, "fargateCluster", {
      vpc: vpc,
    });

    this._serverFileSystem = new efs.FileSystem(this, "valheimServerStorage", {
      vpc: vpc,
      encrypted: true,
    });

    const serverVolumeConfig: ecs.Volume = {
      name: "valheimServerVolume",
      efsVolumeConfiguration: {
        fileSystemId: this._serverFileSystem.fileSystemId,
      },
    };

    const mountPoint: ecs.MountPoint = {
      containerPath: "/config",
      sourceVolume: serverVolumeConfig.name,
      readOnly: false,
    };

    const valheimTaskDefinition = new ecs.TaskDefinition(
      this,
      "valheimTaskDefinition",
      {
        compatibility: ecs.Compatibility.FARGATE,
        cpu: props.cpu,
        memoryMiB: props.memory,
        volumes: [serverVolumeConfig],
        networkMode: ecs.NetworkMode.AWS_VPC,
      }
    );

    const container = valheimTaskDefinition.addContainer("valheimContainer", {
      image: ecs.ContainerImage.fromRegistry("lloesche/valheim-server"),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "ValheimServer",
        logRetention: logs.RetentionDays.ONE_WEEK
      }),
      environment: {
        SERVER_NAME: props.serverName,
        SERVER_PORT: "2456",
        WORLD_NAME: props.worldName,
        SERVER_PUBLIC: "1",
        UPDATE_INTERVAL: "900",
        BACKUPS_INTERVAL: "3600",
        BACKUPS_DIRECTORY: "/config/backups",
        BACKUPS_MAX_AGE: "3",
        BACKUPS_DIRECTORY_PERMISSIONS: "755",
        BACKUPS_FILE_PERMISSIONS: "644",
        CONFIG_DIRECTORY_PERMISSIONS: "755",
        WORLDS_DIRECTORY_PERMISSIONS: "755",
        WORLDS_FILE_PERMISSIONS: "644",
        DNS_1: "10.0.0.2",
        DNS_2: "10.0.0.2",
        STEAMCMD_ARGS: "validate",
        TZ: props.tz
      },
      secrets: {
        SERVER_PASS: ecs.Secret.fromSecretsManager(
          valheimServerPass,
          "VALHEIM_SERVER_PASS"
        ),
      },
    });

    container.addPortMappings(
      {
        containerPort: 2456,
        hostPort: 2456,
        protocol: ecs.Protocol.UDP,
      },
      {
        containerPort: 2457,
        hostPort: 2457,
        protocol: ecs.Protocol.UDP,
      },
      {
        containerPort: 2458,
        hostPort: 2458,
        protocol: ecs.Protocol.UDP,
      }
    );

    container.addMountPoints(mountPoint);

    // setup metric filter on log group to detect idle server (no players connected)
    if (container.logDriverConfig?.options && container.logDriverConfig.options['awslogs-group']) {
      const logGroup = logs.LogGroup.fromLogGroupName(this,
        "valheimContainerLogGroup",
        container.logDriverConfig.options['awslogs-group']);

      // metric
      const noPlayersMetricFilter = new logs.MetricFilter(this, "playerNumberMetricFilter", {
        filterPattern: { logPatternString: "No players connected to Valheim server" },
        metricName: NO_PLAYER_ON_SERVER_METRIC_NAME, metricNamespace: VALHEIM_SERVER_METRIC_NAMESPACE, logGroup,
        defaultValue: 0, metricValue: "1",
      })
      this._noPlayersMetric = noPlayersMetricFilter.metric().with({
        period: Duration.minutes(15), statistic: "sum"
      });
    }

    this._valheimService = new ecs.FargateService(this, "valheimService", {
      cluster: this._fargateCluster,
      taskDefinition: valheimTaskDefinition,
      desiredCount: 0,
      assignPublicIp: true,
      platformVersion: ecs.FargatePlatformVersion.VERSION1_4,
    });

    // update valheim server dns name
    const serverHostedZone = HostedZone.fromLookup(this, 'HostedZone', {
        domainName: props.valheimServerDnsNameHostedZoneName
    })
    new DnsNameUpdaterService(this, "DnsNameUpdaterService", {
      clusterArn: this._fargateCluster.clusterArn,
      serviceArn: this._valheimService.serviceArn,
      valheimServerHostedZone: serverHostedZone,
      valheimServerDnsName: props.valheimServerDnsName
    });

    this._playerCountMetric = new cloudwatch.Metric({
      namespace: VALHEIM_SERVER_METRIC_NAMESPACE,
      metricName: PLAYER_COUNT_METRIC_NAME
    })

    const playerCountMetricService = new PlayerCountMetricService(this, "PlayerCountMetricService", {
      fargateService: this._valheimService,
      region: cdk.Stack.of(this).region,
      playerCountMetric: this._playerCountMetric,
      serviceDNSName: props.valheimServerDnsName
    })

    new AutoScaleDownService(this, "AutoScaleDownService", {
      fargateService: this._valheimService,
      playerCountMetric: this._playerCountMetric,
      region: cdk.Stack.of(this).region
    })

    this._serverFileSystem.connections.allowDefaultPortFrom(this._valheimService);
    this._valheimService.connections.allowFromAnyIpv4(
      new ec2.Port({
        protocol: ec2.Protocol.UDP,
        stringRepresentation: "valheimPorts",
        fromPort: 2456,
        toPort: 2458,
      })
    );

    new cdk.CfnOutput(this, "serviceName", {
      value: this._valheimService.serviceName,
      exportName: "fargateServiceName",
    });

    new cdk.CfnOutput(this, "clusterArn", {
      value: this._fargateCluster.clusterName,
      exportName:"fargateClusterName"
    });

    new cdk.CfnOutput(this, "EFSId", {
      value: this._serverFileSystem.fileSystemId
    })
  }

  get valheimService(): ecs.FargateService {
    return this._valheimService;
  }

  get fargateCluster(): ecs.Cluster {
    return this._fargateCluster
  }

  get noPlayersMetric(): cloudwatch.Metric {
    return this._noPlayersMetric
  }

  get playerCountMetric(): cloudwatch.Metric {
    return this._playerCountMetric
  }

  get serverFileSystemerverFileSystem(): efs.FileSystem {
    return this._serverFileSystem
  }
}
