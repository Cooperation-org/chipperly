#!/usr/bin/env bash
# The dev copy (dev-app.chipperlyapp.com, branch dev). Run as mhany:
#   bash ~/chipperly-dev/deploy/contabo/deploy-dev.sh
# Same steps as deploy.sh, in ~/chipperly-dev, against its own database and unit.
export CHIPPERLY_DIR="$HOME/chipperly-dev"
export CHIPPERLY_SERVICE=chipperly-dev
export CHIPPERLY_PORT=8065
export CHIPPERLY_ORIGIN=https://dev-app.chipperlyapp.com
export CHIPPERLY_ADMIN_ORIGIN=https://dev-admin.chipperlyapp.com
exec bash "$CHIPPERLY_DIR/deploy/contabo/deploy.sh"
