import { ComponentProps } from "solid-js"

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 18 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* N mark for nanocode */}
      <path data-slot="logo-mark-shadow" d="M12 20H4V8H12V20Z" fill="var(--icon-weak-base)" />
      <path data-slot="logo-mark-n" d="M12 4H4V20H0V0H12V4ZM18 20H12V4H18V20Z" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M60 80H20V40H60V80Z" fill="var(--icon-base)" />
      <path d="M60 20H20V80H60V20ZM80 100H0V0H80V100Z" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 234 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g>
        {/* N (shifted from original position 4) */}
        <path d="M18 36H6V18H18V36Z" fill="var(--icon-weak-base)" />
        <path d="M18 12H6V36H0V6H18V12ZM24 36H18V12H24V36Z" fill="var(--icon-base)" />
        {/* A (new letter design) */}
        <path d="M48 36H36V24H48V36Z" fill="var(--icon-weak-base)" />
        <path d="M30 36V6H54V36H48V24H36V36H30Z" fill="var(--icon-base)" />
        {/* N (shifted from original position 4) */}
        <path d="M78 36H66V18H78V36Z" fill="var(--icon-weak-base)" />
        <path d="M78 12H66V36H60V6H78V12ZM84 36H78V12H84V36Z" fill="var(--icon-base)" />
        {/* O (shifted from original position 1) */}
        <path d="M108 30H96V18H108V30Z" fill="var(--icon-weak-base)" />
        <path d="M108 12H96V30H108V12ZM114 36H90V6H114V36Z" fill="var(--icon-base)" />
        {/* C (original position 5) */}
        <path d="M144 30H126V18H144V30Z" fill="var(--icon-weak-base)" />
        <path d="M144 12H126V30H144V36H120V6H144V12Z" fill="var(--icon-strong-base)" />
        {/* O (original position 6) */}
        <path d="M168 30H156V18H168V30Z" fill="var(--icon-weak-base)" />
        <path d="M168 12H156V30H168V12ZM174 36H150V6H174V36Z" fill="var(--icon-strong-base)" />
        {/* D (original position 7) */}
        <path d="M198 30H186V18H198V30Z" fill="var(--icon-weak-base)" />
        <path d="M198 12H186V30H198V12ZM204 36H180V6H198V0H204V36Z" fill="var(--icon-strong-base)" />
        {/* E (original position 8) */}
        <path d="M234 24V30H216V24H234Z" fill="var(--icon-weak-base)" />
        <path d="M216 12V18H228V12H216ZM234 24H216V30H234V36H210V6H234V24Z" fill="var(--icon-strong-base)" />
      </g>
    </svg>
  )
}
