import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { getProjectView } from "@/lib/views";
import { ProjectEditor } from "./project-editor";

export default function ProjectPage(props: PageProps<"/projects/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <ProjectContent params={props.params} />
    </Suspense>
  );
}

async function ProjectContent({ params }: { params: PageProps<"/projects/[id]">["params"] }) {
  const { id } = await params;
  const view = await getProjectView(id);
  if (!view) notFound();
  // Keyed so switching between projects resets the editor's local draft.
  return <ProjectEditor key={view.id} initial={view} />;
}
