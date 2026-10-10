import "./style.css";
import { initTerminal } from "./terminal";

document.querySelector<HTMLAnchorElement>("#town-link")!.search = location.search;
initTerminal();
