import * as cdk from "@aws-cdk/core";
import * as efs from "@aws-cdk/aws-efs";
import { ValheimStorageBackupService } from "./efs-backup-service";
import * as backup from "@aws-cdk/aws-backup";

interface ValheimStorageBackupStackProps extends cdk.StackProps {
  efsStorage: efs.FileSystem;
}

export class ValheimStorageBackupStack extends cdk.Stack {
  constructor(
    scope: cdk.Construct,
    id: string,
    props: ValheimStorageBackupStackProps
  ) {
    super(scope, id, props);

    new ValheimStorageBackupService(this, "ValheimStorageBackupService", {
      backupVault: backup.BackupVault.fromBackupVaultName(
        this,
        "DefaultBackupVault",
        "Default"
      ),
      efsStorage: props.efsStorage,
    });
  }
}
