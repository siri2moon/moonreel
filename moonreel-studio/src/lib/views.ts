import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, scenes } from "@/db/schema";
import { fileUrl } from "@/lib/storage";

/** ASCII file name for downloads: "Cà phê đêm mưa" → "ca-phe-dem-mua". */
function fileSlug(title: string, fallback: string) {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  return slug || fallback;
}

/** Project + scenes shaped for the client editor; one relational query. */
export async function getProjectView(id: string) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, id),
    with: {
      niche: { columns: { id: true, name: true, icon: true, sceneSeconds: true, format: true } },
      character: true,
      scenes: { orderBy: [asc(scenes.index)] },
    },
  });
  if (!project) return null;

  return {
    id: project.id,
    title: project.title,
    topic: project.topic,
    fileSlug: fileSlug(project.title, `moonreel-${project.id.slice(0, 8)}`),
    aspectRatio: project.aspectRatio,
    status: project.status,
    error: project.error,
    updatedAt: project.updatedAt.toISOString(),
    niche: project.niche,
    character: project.character && {
      id: project.character.id,
      name: project.character.name,
      referenceUrl: fileUrl(project.character.referenceImagePath, project.character.updatedAt),
    },
    finalVideoUrl: fileUrl(project.finalVideoPath, project.updatedAt),
    captionsUrl: fileUrl(project.captionsPath, project.updatedAt),
    audioUrl: fileUrl(project.audioPath),
    audioSeconds: project.audioSeconds,
    referenceImageUrl: fileUrl(project.referenceImagePath),
    posts: project.posts,
    postsStatus: project.postsStatus,
    postsError: project.postsError,
    thumbnail: project.thumbnail && {
      text: project.thumbnail.text,
      prompt: project.thumbnail.prompt,
      background: project.thumbnail.background,
      scene: project.thumbnail.scene,
      note: project.thumbnail.note,
      url: fileUrl(project.thumbnail.path, project.updatedAt),
    },
    thumbnailStatus: project.thumbnailStatus,
    thumbnailError: project.thumbnailError,
    scenes: project.scenes.map((s) => ({
      id: s.id,
      index: s.index,
      narration: s.narration,
      visualPrompt: s.visualPrompt,
      camera: s.camera,
      status: s.status,
      error: s.error,
      keyframeUrl: fileUrl(s.keyframePath, s.updatedAt),
      clipUrl: fileUrl(s.clipPath, s.updatedAt),
    })),
  };
}

export type ProjectView = NonNullable<Awaited<ReturnType<typeof getProjectView>>>;
