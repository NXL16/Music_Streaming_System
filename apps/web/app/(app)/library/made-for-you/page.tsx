export default function MadeForYouPage() {
  return (
    <>
      {/* <HeaderWithSort title="Made for You" />

      <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-5.5"></div> */}

      {/* Empty */}
      <div className="bottom-0 text-(--systemSecondary) flex flex-col h-41.5 inset-x-0 justify-center m-auto max-w-110 p-[0_25px] absolute text-center top-0 z-1">
        <div className="">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="50"
            height="50"
            viewBox="0 0 50 50"
            className="h-auto mb-2 w-17.5 fill-(--systemSecondary) align-baseline inline-block"
          >
            <path d="M8.528 50h32.944C47.176 50 50 47.176 50 41.58V8.42C50 2.823 47.176 0 41.472 0H8.528C2.852 0 0 2.797 0 8.42v33.16C0 47.203 2.852 50 8.528 50m-4.155-8.637V8.636c0-2.824 1.493-4.264 4.21-4.264h32.835c2.688 0 4.209 1.44 4.209 4.264v32.727c0 2.119-.869 3.477-2.444 3.993-2.363-6.654-9.533-11.299-18.17-11.299-8.663 0-15.806 4.645-18.169 11.326-1.602-.543-2.471-1.901-2.471-4.02m20.64-11.841c5.188.054 9.262-4.373 9.262-10.185 0-5.459-4.074-9.967-9.261-9.967-5.188 0-9.316 4.508-9.289 9.967.028 5.812 4.101 10.13 9.289 10.185z"></path>
          </svg>
        </div>

        <h2 className="[font:var(--title-2-emphasized)]">
          Personal mixes that you add will appear here.
        </h2>
      </div>
    </>
  );
}
