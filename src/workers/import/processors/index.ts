import { registerProcessor } from "../registry";
import { ImmichSharedLinkProcessor } from "./immich-shared-link";
import { NextcloudSharedLinkProcessor } from "./nextcloud-shared-link";
import { EnteSharedLinkProcessor } from "./ente-shared-link";

registerProcessor("immich", new ImmichSharedLinkProcessor());
registerProcessor("nextcloud", new NextcloudSharedLinkProcessor());
registerProcessor("ente", new EnteSharedLinkProcessor());
