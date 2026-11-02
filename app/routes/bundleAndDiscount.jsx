import { redirect } from "react-router";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  return redirect(`/app/bundleAndDiscount${url.search}`);
};

export default function RedirectBundleAndDiscount() {
  return null;
}
