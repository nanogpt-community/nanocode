import { Link, Meta } from "@solidjs/meta"

export const Favicon = () => {
  return (
    <>
      <Link rel="icon" type="image/png" href="@nanogpt/favicon-96x96-v3.png" sizes="96x96" />
      <Link rel="shortcut icon" href="@nanogpt/favicon-v3.ico" />
      <Link rel="apple-touch-icon" sizes="180x180" href="@nanogpt/apple-touch-icon-v3.png" />
      <Link rel="manifest" href="@nanogpt/site.webmanifest" />
      <Meta name="apple-mobile-web-app-title" content="NanoCode" />
    </>
  )
}
