import Link from "next/link";
import DeskPage from "@/components/chrome/desk-page";
import NoticeSheet from "@/components/court/notice-sheet";
import { buttonClass } from "@/components/court/button";

export default function NotFound() {
  return (
    <DeskPage>
      <NoticeSheet
        form={["Order 404", "Matter not found"]}
        word="404"
        stamp="DISMISSED"
        title="Page Not Found"
        actions={
          <>
            <Link href="/" className={buttonClass("seal")}>
              Back to Home
            </Link>
            <Link href="/cases" className={buttonClass("paper")}>
              My cases
            </Link>
          </>
        }
      >
        The page you are looking for doesn&apos;t exist or has been moved.
      </NoticeSheet>
    </DeskPage>
  );
}
