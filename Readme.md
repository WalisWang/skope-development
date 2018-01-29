The purpose of this repo is to have a single repo to checkout the entire platform for development, no matter which sub-system is being worked on.

This repo is not for deploying the platform.

## Checkout the code

The submodules should all be using SSH so please checkout the root repo with SSH. You would need to have your SSH keys added to Github.

```
git clone --recursive git@github.com:openskope/skope-development.git
```

## Run the system

```
docker-compose up
```

To-do
- Local test data for ElasticSearch needs to be added.
- Local test data for GeoServer needs to be added.

## Directories

- `configs` stores all the config files used by the containers. The settings could put the services/apps into verbose mode, for example, for development purposes.
- `runtime-data` is reserved for all the runtime data generated by the containers. For instance the data generated by ElasticSearch.
- `web-app` is a submodule directory for the Meteor app.
