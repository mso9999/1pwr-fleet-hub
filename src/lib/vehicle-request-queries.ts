/**
 * Shared SELECT for vehicle_requests with assigned vehicle + requestor email (for UI permissions).
 * `requested_by_id` stores Fleet Hub `users.id`; join resolves email for matching the signed-in user.
 */
export const VR_SELECT_FIELDS = `
    vr.*,
    COALESCE(ehs_drv.display_name, ehs_drv.email, '') as designated_operator_label,
    ehs_drv.email as designated_operator_email,
    COALESCE(av.code, mav.code) as assigned_vehicle_code,
    COALESCE(av.make, mav.make) as assigned_vehicle_make,
    COALESCE(av.model, mav.model) as assigned_vehicle_model,
    COALESCE(vr.assigned_vehicle_id, m.assigned_vehicle_id) as display_assigned_vehicle_id,
    u_req.email as requested_by_email,
    m.title as mission_title,
    m.destination as mission_destination,
    m.departure_date as mission_departure_date,
    m.return_date as mission_return_date,
    m.status as mission_status,
    m.trip_id as mission_trip_id,
    m.approval_status as mission_approval_status`;

export const VR_FROM_JOIN = `
    FROM vehicle_requests vr
    LEFT JOIN ehs_approved_drivers ehs_drv ON ehs_drv.id = vr.designated_operator_id
    LEFT JOIN vehicles av ON vr.assigned_vehicle_id = av.id
    LEFT JOIN missions m ON m.id = vr.mission_id
    LEFT JOIN vehicles mav ON m.assigned_vehicle_id = mav.id
    LEFT JOIN users u_req ON u_req.id = vr.requested_by_id`;
