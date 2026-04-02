import OutletModel from "../models/outlets";
import FloorModel from "../models/floor";
import Utils from "../utils";

const utils = new Utils();

export async function ensureOutletUnderCompany(companyId: string, outletId: string) {
  const outlet = await OutletModel.findOne({ _id: outletId, companyId });
  if (!outlet) throw utils.createError(404, "Outlet does not belong to your company");
  return outlet;
}

export async function ensureFloorUnderCompany(companyId: string, floorId: string) {
  const floor = await FloorModel.findById(floorId).populate("outletId");
  if (!floor) throw utils.createError(404, "Floor not found");

  // floor.outletId is an outlet doc → check company match
  // @ts-ignore because populate returns doc
  if (floor.outletId.companyId.toString() !== companyId.toString()) {
    throw utils.createError(403, "Floor does not belong to your company");
  }
  return floor;
}
