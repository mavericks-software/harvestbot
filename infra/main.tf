provider "google" {
  credentials = "${file("${var.gcloud_credentials_path}")}"
  region      = "${var.gcloud_project_region}"
  version     = "~> 3.88"
}

# Project creation manually for now
#resource "google_project" "harvestbot" {
#  name = "${var.gcloud_project_id}"
#  project_id = "${var.gcloud_project_id}"
#  org_id = "${var.gcloud_organisation_id}"
#}
