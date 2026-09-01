export type Role = "P" | "D" | "C" | "A";

export type Player = {
  id: number;
  role: Role;
  mantra_role: string | null;
  name: string;
  team: string;
  quote_a: number | null;
  quote_i: number | null;
  quote_diff: number | null;
  fvm: number | null;
  status: "available" | "sold";
};

export type Participant = {
  id: string;
  display_name: string;
  login_name: string;
  is_admin: boolean;
  budget_remaining: number;
};

export type Auction = {
  id: string;
  player_id: number;
  status: "live" | "confirmed" | "cancelled";
  current_price: number;
  highest_bidder_id: string | null;
  ends_at: string;
  created_at: string;
};

export type Purchase = {
  id: string;
  player_id: number;
  participant_id: string;
  price: number;
  auction_id: string;
  purchased_at: string;
};

export type Bid = {
  id: number;
  auction_id: string;
  bidder_id: string;
  amount: number;
  created_at: string;
};
