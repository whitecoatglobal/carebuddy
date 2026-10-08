import { Icon } from "./Icon";
import type { ChatMessage } from "./types";

export const WHITECOAT_GP_URL = "https://link.whitecoat.com.sg/dXEf/nnq8g6r9";

export function BuddyCareAction({
  navigation,
  onUrgentHelp,
}: {
  navigation: ChatMessage["careNavigation"];
  onUrgentHelp: () => void;
}) {
  if (!navigation) return null;
  const emergency = navigation === "emergency";
  return (
    <section
      className={"buddy-care-action" + (emergency ? " buddy-care-urgent" : "")}
      aria-label={
        emergency ? "Urgent care guidance" : "WhiteCoat GP consultation"
      }
    >
      <div className="buddy-care-heading">
        <span className="buddy-care-icon">
          <Icon name={emergency ? "warning" : "plus"} />
        </span>
        <div>
          <span className="eyebrow">
            {emergency ? "URGENT HELP" : "NEXT STEP"}
          </span>
          <h3>{emergency ? "Get help now" : "Speak with a GP"}</h3>
        </div>
      </div>
      <p>
        {emergency
          ? "Contact your local emergency service directly if there is immediate danger."
          : "Continue to WhiteCoat to arrange a GP consultation."}
      </p>
      {emergency ? (
        <button className="primary" onClick={onUrgentHelp}>
          View emergency-help instructions <Icon name="arrow" />
        </button>
      ) : (
        <>
          <a
            className="buddy-gp-link"
            href={WHITECOAT_GP_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            See a GP on WhiteCoat <Icon name="arrow" />
          </a>
          <small className="buddy-care-note">
            Opens WhiteCoat in a new tab
          </small>
        </>
      )}
    </section>
  );
}
