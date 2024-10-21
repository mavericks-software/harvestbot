# Harvestbot

[![Greenkeeper badge](https://badges.greenkeeper.io/newthingsco/harvestbot.svg)](https://greenkeeper.io/)

Slackbot for calculating Harvest balance.

* Harvest user can query her flextime balance using the bot.
* Harvest admins can also generate excel sheets with monthly statistics of all users.
* Supports only Finnish working regulation and public holidays.

Harvestbot is deployed in Google Cloud. Functionality is implemented with Google Cloud functions that can be integrated to Slack service. Emails are sent using [SendGrid](https://sendgrid.com/)-service.

![Harvestbot environment](./docs/harvestbot-env.png "Harvestbot environment")

## Usage

### Flextime balance for the current Slack user

```/flextime```

![Flextime example](./docs/flextime-slack.png "Flextime example")

### Monthly statistics excel

```/flextime stats 2019 3```

Statistics sheet displays work time statistics for each company employee. The second tab gives detailed information for billable hours that can be used as the basis for billing.

### Billing report PDFs

The ```report``` command identifies users by their last names and generates a monthly PDF report for every project for which they have billable entries in the given month. The reports will then be sent via email to the user that entered the command.

```/flextime report 2019 3 virtanen meikäläinen```

### Working hours report

```/flextime hours 2019 1 6```

The ```hours``` command creates a report containing the maximum and actual working hours for every active non-contractor employee during the given time range.

The first two parameters are the starting year and month for the time range. The last parameter defines the length of the time range in months, it is optional and set to 6 months by default. For example, the parameters ```2022 3 4``` will result in a range from 2022-03-01 to 2022-06-31.

The values in the report are calculated as follows:
* ***Non-vacation days***: all weekdays mo-fr in the time range (public holidays are included), minus paid vacation days
* ***Vacation days***: paid vacation days
* ***Working weeks***: non-vacation days / 5
* ***Max work hours***: working weeks * 48
* ***Total working hours***: all hours entered in Harvest, except
   * Paid vacation
   * Unpaid vacation
   * Extra paid leave
   * Parental leave

***Please note*** that if new tasks that should ***not*** be included in the total working hours are added to Harvest, they must be
* added to the src/settings/config.js as variables (```TASK_ID_...```)

### Monthly reminders

Reminders will be sent automatically every last day of the month to users that have days with no entries in Harvest (excluding contractors). They will be sent at 13:00 and 18:00. ***TODO:*** Send reminders on the last ***working*** day of the month.

## Development

Harvestbot functionality can be triggered from local machine using CLI-interface. Install relevant tools and setup environment variables first.

### Environment setup

* [nvm](https://github.com/creationix/nvm) (or install and activate Node version required in file ./nvmrc)
* [direnv](https://github.com/direnv/direnv) (or manage environment variables as you prefer)
* You need an existing [Google Cloud](https://console.cloud.google.com/) project to run the code.
* [Download key](https://cloud.google.com/iam/docs/keys-create-delete#iam-service-account-keys-create-console) in JSON format from cloud console to be able to acccess your project.
  * Create the key for the account that has an email that ends in @appspot.gserviceaccount.com.
* Copy .envrc.example > .envrc
* Export relevant Google Cloud configuration variables:

```
# .envrc

# Google cloud project ID
export GCLOUD_PROJECT=XXX

# Google cloud region for cloud functions
export GCLOUD_FUNCTION_REGION=europe-west3
export FUNCTION_REGION=europe-west3

# Path to JSON file you created in Google Cloud console
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/file.json

...
```

* If you already have an existing (and deployed) Google Cloud project, you can print out the app current configuration with the decrypt command. 
* For new projects you need to define the configuration data from scratch:
  * Create API token for your Harvest account in [Harvest developer view](https://id.getharvest.com/developers). Your Harvest user needs to have admin-level rights to be able to access all features.
  * Create API key for [SendGrid](https://sendgrid.com/)-service.
  * Fetch company task information with [API request](https://help.getharvest.com/api-v2/tasks-api/tasks/tasks/). You need the task ids for configuring flextime calculation correctly.
* Fill in rest of the needed env variables in .envrc using the decrypt command output

### Changing non-secret config

All config variables that don't need security are located in `src/settings/config.js`. Edit them there.s

### Running locally

```
> nvm use 
> npm install
> npm run build
> node ./build/local.js --help
Usage: local [options] [command]

Options:
  -v, --version                 output the version number
  -h, --help                    output usage information

Commands:
  stats <email> <year> <month>                    Send monthly statistics to given email address.
  reports <email> <year> <month> <last names...>  Send monthly billing report to given email address, select consultants by last names
  flextime <email>                                Calculate flex saldo for given user.
  encrypt                                         Encrypt and store app configuration.
  decrypt                                         Decrypt and show app configuration.
```

Example:
```
npm start flextime laura.vuorenoja@newthings.co

> harvestbot@1.0.0 start /Users/lauravuo/work/NewThingsCo/harvestbot
> npm run build && node ./build/local.js "flextime" "laura.vuorenoja@newthings.co"


> harvestbot@1.0.0 build /Users/lauravuo/work/NewThingsCo/harvestbot
> rimraf build/ && babel ./src --out-dir build/ --ignore **/*.test.js

Successfully compiled 20 files with Babel.
[2019-03-17T11:03:20.294Z] info: Calculating flextime for laura.vuorenoja@newthings.co
[2019-03-17T11:03:20.295Z] info: Fetch data for laura.vuorenoja@newthings.co
[2019-03-17T11:03:36.031Z] info: Received range starting from Wednesday, June 7, 2017 to Friday, March 15, 2019
[2019-03-17T11:03:36.034Z] info: Total working hours from range start 3360
[2019-03-17T11:03:36.041Z] info: No warnings!
[2019-03-17T11:03:36.043Z] info: *Your flex hours count: -0.5*
[2019-03-17T11:03:36.043Z] info: All done!
[2019-03-17T11:03:36.043Z] info: *Your flex hours count: -0.5*
[2019-03-17T11:03:36.044Z] info: Latest calendar working day: Friday, March 15, 2019
[2019-03-17T11:03:36.044Z] info: Last time you have recorded hours: Friday, March 15, 2019
[2019-03-17T11:03:36.044Z] info: Current month 82% billable
```

## Deployment

### Google Cloud project setup

You need [Terraform](https://www.terraform.io/) to initialize the cloud resources.

* [Create new project](https://console.cloud.google.com/) in Google Cloud console (or use the one you created when setting up local environment).
* Enable needed APIs for your project in Google Cloud console: Cloud Functions API, Cloud Key Management Service (KMS) API, Cloud Resource Manager API
* Create datastore database (in datastore mode) to your region (in Google Cloud console).
* Set up and login gcloud CLI tool [Documentation](https://cloud.google.com/sdk/docs/how-to)
* Make sure the service account has following roles (in Google Cloud Console IAM view): Cloud KMS CryptoKey Encrypter/Decrypter, Editor, Project IAM Admin
* Define following environment variables:
```
export TF_VAR_gcloud_project_region=<gcloud_region>
export TF_VAR_gcloud_project_id=<gcloud_project_id>
export TF_VAR_gcloud_organisation_id=<gcloud_organisation_id>
export TF_VAR_gcloud_member_kms_manager=user:<your_email>
export TF_VAR_gcloud_member_secret_decrypter=serviceAccount:<gcloud_project_id>@appspot.gserviceaccount.com
export TF_VAR_gcloud_service_account_email=<gcloud_project_id>@appspot.gserviceaccount.com
```
* Initialize encryption related resources to Google Cloud using Terraform-tool:
```
cd infra
terraform init
terraform apply
```

### Integrate bot to Slack

1. [Create new Slack App](https://api.slack.com/apps)
2. From the "App Home" tab: make sure that "Messages tab" is turned on and that the "Allow users to send Slash commands and messages from the messages tab" checkbox is selected
2. Configure the slash command that will trigger your bot in the "Slash Commands" tab. The request URL you can fill out later when you have the cloud functions in place.
3. Add permissions for scopes **commands**, **chat:write**, **im:write**, **mpim:write**, **users:read** and **users:read.email** to be able to send messages to your workspace and get the users email addresses.
5. Install the app to your workspace.
6. Record the Slack signing secret and OAuth access token for configuration in later step.

### Storing encrypted app configuration

App configuration should be stored to Google Storage using the encrypt feature of the tool locally.

* Define environment variables described [in setting up the local development](#environment-setup)

* Define settings for Slack integration

```
  #.envrc
  ...

  # Token for accessing the Slack API
  export SLACK_BOT_TOKEN=XXX
  # Secret for confirming that each request comes from Slack by verifying its unique signature.
  export SLACK_SIGNING_SECRET=XXX
  # Channel id for sending the weekly notifications
  export SLACK_NOTIFY_CHANNEL_ID=XXX
```

* The app will pick up the configuration from environment variables and bundle them to a file. Encrypt the first version to Google Storage

```
  npm run init:config
```

After you have successfully stored the configuration for the first time, you can later on save the changed configuration by running:
```
  npm start encrypt
```

Exporting the stored configuration to console output can be done using command "decrypt".

### Cloud functions deployment

The authenticated user should have permissions (at minimum):
* Cloud Functions Developer
* Service Account User

If you want to deploy individual functions, copy the row from the file below, and run just the row.

```
./tools/deploy.sh
```

When the deployment is done, copy the URL for initFlextime-function (from Google Cloud Console) and paste it to Slack slash command configuration. The format should be something like https://REGION-PROJECT_ID.cloudfunctions.net/initFlextime. Test out the command from Slack and see from Google Cloud Console logs what went wrong :)

### Trigger notifications

Weekly flextime notifications can be triggered using through HTTP interface. See the CI configuration of this project for an example.

### Trigger monthly reminders via Cloud Scheduler

As of 04/2022, the Google Cloud Scheduler only supports the basic cron syntax, so it is not possible to run a job every last day of the month. We have to run the job every day and check if it is the last day of the month in the triggered function.

* Trigger monthly reminders function every day at 13:00 and 18:00
```
gcloud scheduler jobs create http firstReminder --schedule="0 13 * * *" --time-zone Europe/Helsinki --uri=<sendReminders http trigger url> --oidc-service-account-email=<gcloud_project_id>@appspot.gserviceaccount.com
gcloud scheduler jobs create http secondReminder --schedule="0 18 * * *" --time-zone Europe/Helsinki --uri=<sendReminders http trigger url> --oidc-service-account-email=<gcloud_project_id>@appspot.gserviceaccount.com
```

### Admin missing hours report

Automated task similar to reminders for missing hours. Purpose is to send report collected from Harvest to admin about missing work hours. This reporting is triggered 1st day of the month from previous month unfilled working hours with GCP Cloud Scheduler which puts message to Pub/Sub with topic `missingWorkhoursReport` and processed with function `sendMissingHoursReport`
```
gcloud scheduler jobs create pubsub reportMissingHour --location=<project-region> --schedule="0 7 1 * *" --time-zone Europe/Helsinki --topic=missingWorkhoursReport --message-body="{}"
```

