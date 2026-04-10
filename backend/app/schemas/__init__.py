from app.schemas.appointment import AppointmentCreate, AppointmentOut, AppointmentUpdate
from app.schemas.auth import Token, UserCreate, UserLogin, UserOut
from app.schemas.patient_record import PatientRecordCreate, PatientRecordOut, PatientRecordUpdate
from app.schemas.telehealth import TelehealthSessionOut

__all__ = [
    "Token",
    "UserCreate",
    "UserLogin",
    "UserOut",
    "PatientRecordCreate",
    "PatientRecordOut",
    "PatientRecordUpdate",
    "AppointmentCreate",
    "AppointmentOut",
    "AppointmentUpdate",
    "TelehealthSessionOut",
]
