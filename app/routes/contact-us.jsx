import { redirect } from "react-router";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  return redirect(`/app/contact-us${url.search}`);
};

export default function RedirectContactUs() {
  return null;
}
