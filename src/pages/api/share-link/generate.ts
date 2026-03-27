
import { ENV } from "@/config/environment";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { sign } from "jsonwebtoken";
import { NextApiRequest, NextApiResponse } from "next";


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const currentUser = await getCurrentUser(req);
  const allFilters = req.body;
  const { expiresIn, ...filters } = allFilters;

  try {
  if (!currentUser) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (!ENV.JWT_SECRET) {
    return res.status(401).json({ message: "The JWT_SECRET is missing in the .env file. Please add it to the .env file for generating share links" });
  }

  if (!ENV.POWER_TOOLS_ENDPOINT_URL) {
    return res.status(401).json({ message: "The POWER_TOOLS_ENDPOINT_URL is missing in the .env file. Please add it to the .env file for generating share links" });
  }

  const token = sign({ ...filters, userId: currentUser.id }, ENV.JWT_SECRET, expiresIn !== "never" ? {
    expiresIn: expiresIn
  } : {});

    return res.status(200).json({ link: `${ENV.POWER_TOOLS_ENDPOINT_URL}/s/${token}` });
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}
