import type { niches } from "@/db/schema";

/**
 * The sample niches that ship with MoonReel. Your own niches belong in private niche files
 * (see private-niches.ts), not here: this file is public.
 */
export const DEFAULT_NICHES: (typeof niches.$inferInsert)[] = [
  {
    slug: "personal-finance",
    thumbnailStyle: "boxed",
    thumbnailAccent: "#34D399",
    thumbnailBrand: "",
    icon: "💰",
    name: "Tài chính cá nhân",
    description: "Kiến thức tiền bạc thực tế cho người trẻ đi làm.",
    scriptInstructions: [
      "- Mở đầu bằng một con số hoặc sai lầm phổ biến gây giật mình.",
      "- Mỗi cảnh một ý duy nhất, có ví dụ bằng tiền Việt Nam cụ thể.",
      "- Không hứa hẹn làm giàu nhanh, không khuyến nghị mua mã cổ phiếu/coin cụ thể.",
      "- Kết thúc: kêu gọi follow để nhận mẹo tiếp theo.",
    ].join("\n"),
    tone: "Thân thiện, rõ ràng, như một người anh/chị đi trước",
    visualStyle: "clean modern 3D animation, soft warm lighting, pastel colors",
    sceneCount: 6,
    sceneSeconds: 10,
    language: "Vietnamese",
  },
  {
    slug: "did-you-know",
    thumbnailStyle: "impact",
    thumbnailAccent: "#FFD23F",
    thumbnailBrand: "",
    icon: "🔭",
    name: "Sự thật thú vị",
    description: "Những sự thật bất ngờ về khoa học, lịch sử, thế giới.",
    scriptInstructions: [
      "- Câu đầu tiên dạng 'Bạn có biết…?' với một sự thật khó tin.",
      "- Giải thích ngắn gọn vì sao điều đó đúng, chỉ dùng thông tin đã được kiểm chứng.",
      "- Cảnh cuối đặt một câu hỏi để người xem bình luận.",
    ].join("\n"),
    tone: "Tò mò, hào hứng",
    visualStyle: "vibrant stylized 3D, cinematic lighting, rich detail",
    sceneCount: 5,
    sceneSeconds: 10,
    language: "Vietnamese",
  },
  {
    slug: "night-stories",
    thumbnailStyle: "cinematic",
    thumbnailAccent: "#9DB8FF",
    thumbnailBrand: "",
    icon: "🌙",
    name: "Truyện kể đêm khuya",
    description: "Truyện bí ẩn / kinh dị nhẹ, kể theo ngôi thứ nhất.",
    scriptInstructions: [
      "- Kể theo mạch: bối cảnh → điều bất thường → cao trào → cái kết mở.",
      "- Không máu me, không bạo lực chi tiết.",
      "- Cảnh cuối mời người xem đoán cái kết trong bình luận.",
    ].join("\n"),
    tone: "Thì thầm, chậm rãi, hồi hộp",
    visualStyle: "moody cinematic, low key lighting, blue and amber tones, light fog",
    sceneCount: 6,
    sceneSeconds: 10,
    language: "Vietnamese",
  },
  {
    slug: "ai-tech-tips",
    thumbnailStyle: "boxed",
    thumbnailAccent: "#FFC23D",
    thumbnailBrand: "",
    icon: "🤖",
    name: "Mẹo công nghệ & AI",
    description: "Hướng dẫn nhanh công cụ AI và mẹo công nghệ dùng ngay được.",
    scriptInstructions: [
      "- Mở đầu bằng lợi ích cụ thể (tiết kiệm bao nhiêu thời gian/tiền).",
      "- Các bước làm theo thứ tự, mỗi cảnh một bước.",
      "- Kết thúc: lưu video lại và follow.",
    ].join("\n"),
    tone: "Năng động, tự tin, dễ hiểu",
    visualStyle: "sleek futuristic office, neon accent lighting, crisp 3D render",
    sceneCount: 6,
    sceneSeconds: 10,
    language: "Vietnamese",
  },
];

export const DEFAULT_NICHE_SLUGS = new Set(DEFAULT_NICHES.map((n) => n.slug));
