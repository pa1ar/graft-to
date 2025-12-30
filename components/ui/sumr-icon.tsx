interface SumrIconProps {
  className?: string
}

export function SumrIcon({ className }: SumrIconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect x="45.394" y="229.972" width="421.725" height="32" rx="16" fill="currentColor" />
      <rect x="111.061" y="349.972" width="290.392" height="32" rx="16" fill="currentColor" />
      <rect x="143.112" y="289.972" width="226.29" height="32" rx="16" fill="currentColor" />
      <rect x="231.256" y="409.972" width="50" height="50" rx="25" fill="currentColor" />
      <path
        d="M387.397 199.326C401.204 199.326 412.647 188.021 409.856 174.499C407.876 164.904 404.749 155.498 400.511 146.444C392.665 129.678 381.163 114.444 366.664 101.612C352.166 88.78 334.953 78.6011 316.009 71.6564C297.065 64.7118 276.761 61.1375 256.257 61.1375C235.752 61.1375 215.448 64.7118 196.505 71.6564C177.561 78.6011 160.348 88.78 145.849 101.612C131.35 114.444 119.849 129.678 112.002 146.444C107.764 155.498 104.637 164.904 102.657 174.499C99.8669 188.021 111.31 199.326 125.117 199.326L256.257 199.326H387.397Z"
        fill="currentColor"
      />
    </svg>
  )
}
