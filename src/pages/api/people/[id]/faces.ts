import { db } from "@/config/db";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { assetFaces, assets, person } from "@/schema";
import { faceSearch } from "@/schema/faceSearch.schema";
import { and, eq } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";

interface FaceWithEmbedding {
  id: string;
  assetId: string;
  personId: string | null;
  imageWidth: number;
  imageHeight: number;
  boundingBoxX1: number;
  boundingBoxY1: number;
  boundingBoxX2: number;
  boundingBoxY2: number;
  assetType: string;
  originalFileName: string;
  embedding: number[];
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Greedy clustering: iterate faces, assign each to the nearest existing
 * cluster centroid if similarity >= threshold, otherwise start a new cluster.
 * Centroids are the mean embedding of all faces in the cluster.
 */
function clusterFaces(
  faces: FaceWithEmbedding[],
  threshold: number
) {
  const clusters: {
    centroid: number[];
    faces: FaceWithEmbedding[];
  }[] = [];

  for (const face of faces) {
    let bestIdx = -1;
    let bestSim = -1;

    for (let i = 0; i < clusters.length; i++) {
      const sim = cosineSimilarity(face.embedding, clusters[i].centroid);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0 && bestSim >= threshold) {
      const cluster = clusters[bestIdx];
      cluster.faces.push(face);
      // Update centroid as running mean
      const n = cluster.faces.length;
      cluster.centroid = cluster.centroid.map(
        (v, i) => v + (face.embedding[i] - v) / n
      );
    } else {
      clusters.push({
        centroid: [...face.embedding],
        faces: [face],
      });
    }
  }

  return clusters;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { id, threshold: thresholdParam } = req.query as {
      id: string;
      threshold?: string;
    };
    const threshold = thresholdParam ? parseFloat(thresholdParam) : 0.65;

    const currentUser = await getCurrentUser(req);

    const personRecords = await db
      .select()
      .from(person)
      .where(and(eq(person.id, id), eq(person.ownerId, currentUser.id)))
      .limit(1);

    const personRecord = personRecords?.[0];
    if (!personRecord) {
      return res.status(404).json({ error: "Person not found" });
    }

    const faces = await db
      .select({
        id: assetFaces.id,
        assetId: assetFaces.assetId,
        personId: assetFaces.personId,
        imageWidth: assetFaces.imageWidth,
        imageHeight: assetFaces.imageHeight,
        boundingBoxX1: assetFaces.boundingBoxX1,
        boundingBoxY1: assetFaces.boundingBoxY1,
        boundingBoxX2: assetFaces.boundingBoxX2,
        boundingBoxY2: assetFaces.boundingBoxY2,
        assetType: assets.type,
        originalFileName: assets.originalFileName,
        embedding: faceSearch.embedding,
      })
      .from(assetFaces)
      .innerJoin(assets, eq(assets.id, assetFaces.assetId))
      .leftJoin(faceSearch, eq(faceSearch.faceId, assetFaces.id))
      .where(
        and(
          eq(assetFaces.personId, id),
          eq(assets.ownerId, currentUser.id)
        )
      );

    // Separate faces with and without embeddings
    const withEmbeddings: FaceWithEmbedding[] = [];
    const withoutEmbeddings: typeof faces = [];

    for (const face of faces) {
      if (face.embedding) {
        withEmbeddings.push(face as FaceWithEmbedding);
      } else {
        withoutEmbeddings.push(face);
      }
    }

    const clusters = clusterFaces(withEmbeddings, threshold);

    // Sort clusters by size descending (largest cluster first)
    clusters.sort((a, b) => b.faces.length - a.faces.length);

    const result = clusters.map((cluster, index) => ({
      clusterId: index,
      count: cluster.faces.length,
      // Return a few representative faces (first 6) plus all face IDs
      previewFaces: cluster.faces.slice(0, 6).map(stripEmbedding),
      faceIds: cluster.faces.map((f) => f.id),
    }));

    // If there are faces without embeddings, add them as a separate group
    if (withoutEmbeddings.length > 0) {
      result.push({
        clusterId: result.length,
        count: withoutEmbeddings.length,
        previewFaces: withoutEmbeddings.slice(0, 6).map((f) => ({
          id: f.id,
          assetId: f.assetId,
          personId: f.personId,
          imageWidth: f.imageWidth,
          imageHeight: f.imageHeight,
          boundingBoxX1: f.boundingBoxX1,
          boundingBoxY1: f.boundingBoxY1,
          boundingBoxX2: f.boundingBoxX2,
          boundingBoxY2: f.boundingBoxY2,
          assetType: f.assetType,
          originalFileName: f.originalFileName,
        })),
        faceIds: withoutEmbeddings.map((f) => f.id),
      });
    }

    return res.status(200).json({
      totalFaces: faces.length,
      clusters: result,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
}

function stripEmbedding(face: FaceWithEmbedding) {
  return {
    id: face.id,
    assetId: face.assetId,
    personId: face.personId,
    imageWidth: face.imageWidth,
    imageHeight: face.imageHeight,
    boundingBoxX1: face.boundingBoxX1,
    boundingBoxY1: face.boundingBoxY1,
    boundingBoxX2: face.boundingBoxX2,
    boundingBoxY2: face.boundingBoxY2,
    assetType: face.assetType,
    originalFileName: face.originalFileName,
  };
}
