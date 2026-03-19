import DeploymentData from "./deployment.mjs";
import ManeuverData from "./maneuver.mjs";
import StarshipModData from "./starshipmod.mjs";
import StarshipSizeData from "./starshipsize.mjs";

export { DeploymentData, ManeuverData, StarshipModData, StarshipSizeData };

export const config = {
  ["sw5e.deployment"]: DeploymentData,
  ["sw5e.maneuver"]: ManeuverData,
  ["sw5e.starshipmod"]: StarshipModData,
  ["sw5e.starshipsize"]: StarshipSizeData
};
