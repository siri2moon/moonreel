import { Orbit } from "lucide-react";
import { Empty, LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <Empty icon={<Orbit />} title="Lạc vào khoảng không">
      <p>Trang này không tồn tại hoặc đã bị xoá.</p>
      <LinkButton href="/" className="mt-5">
        Về tổng quan
      </LinkButton>
    </Empty>
  );
}
