import { redirect } from "react-router";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  return redirect(`/app/createNewBundle${url.search}`);
};

export default function RedirectCreateNewBundle() {
  return null;
}
