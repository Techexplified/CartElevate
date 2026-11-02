import { redirect } from "react-router";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  return redirect(`/app/protectionAndWrapping${url.search}`);
};

export default function RedirectProtectionAndWrapping() {
  return null;
}
