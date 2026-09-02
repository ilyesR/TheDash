import ProjectDetailView from "@/components/ui/project-detail-view";

export default async function ProjectPage(props: PageProps<"/projects/[id]">) {
  const { id } = await props.params;
  return <ProjectDetailView projectId={id} />;
}
