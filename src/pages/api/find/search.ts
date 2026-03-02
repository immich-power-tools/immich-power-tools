import { db } from "@/config/db";
import { ENV } from "@/config/environment";
import { ASSET_VIDEO_PATH } from "@/config/routes";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { cleanUpAsset, isFlipped } from "@/helpers/asset.helper";
import { parseFindQuery } from "@/helpers/ai.helper";
import { person } from "@/schema";
import { Person } from "@/schema/person.schema";
import { inArray } from "drizzle-orm";
import { NextApiRequest, NextApiResponse } from "next";

export default async function search(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { query } = req.body;
    const currentUser = await getCurrentUser(req);
    const parsedQuery = await parseFindQuery(query as string);
    const { personIds } = parsedQuery;

    let dbPeople: Person[] = [];
    if (personIds) {
      dbPeople = await db
        .select()
        .from(person)
        .where(inArray(person.id, personIds));
    }

    const url = ENV.IMMICH_URL + "/api/search/smart";

    return fetch(url, {
      method: "POST",
      body: JSON.stringify({ ...parsedQuery, withExif: true }),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentUser?.accessToken}`,
      },
    })
      .then((response) => {
        if (response.status !== 200) {
          return res.json({
            assets: [],
            filters: parsedQuery,
            error: "Failed to fetch assets",
            errorData: response.json(),
          });
        }
        return response.json();
      })
      .then((data) => {
        const items = data.assets.items
          .map((item: any) => {
            return {
              ...item,
              exifImageHeight: isFlipped(item?.exifInfo?.orientation)
                ? item?.exifInfo?.exifImageWidth
                : item?.exifInfo?.exifImageHeight,
              exifImageWidth: isFlipped(item?.exifInfo?.orientation)
                ? item?.exifInfo?.exifImageHeight
                : item?.exifInfo?.exifImageWidth,
              orientation: item?.exifInfo?.orientation,
              downloadUrl: ASSET_VIDEO_PATH(item.id),
            };
          })
          .map(cleanUpAsset);
        res.status(200).json({
          assets: items,
          filters: {
            ...parsedQuery,
            personIds: dbPeople.map((person) => person.name),
          },
        });
      })
      .catch((err) => {
        res.status(500).json({ message: err.message });
      });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to parse query" });
  }
}
